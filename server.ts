// bb-plugin-navaigate-skin — backend entry.
//
// One read-only job: tell the usage dock which pooled account a chat is
// actually running on. bb's Account Pooler pins each provider session to an
// account (table pool_affinity) and keeps a current fallback per provider
// (pool_active_account). It does not publish that mapping over RPC, so we read
// its SQLite file read-only. If the file or tables are missing (pooler off or
// changed) we return nulls and the dock falls back to the local login.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

// ---- Rail state: tags, "come back later" marks, section order (synced via bb) ----

const TAG_COLORS = ["gold", "ink", "green", "red", "plum", "teal", "sand"] as const;
const tagSchema = z.object({ id: z.string(), name: z.string().min(1).max(32), color: z.enum(TAG_COLORS) });
const laterSchema = z.object({ reason: z.enum(["revisit", "done", "mistake"]), at: z.number() });
const stateSchema = z.object({
  tags: z.array(tagSchema),
  assign: z.record(z.string(), z.array(z.string())),
  later: z.record(z.string(), laterSchema),
  order: z.array(z.string()),
  collapsed: z.array(z.string()),
});
export type RailState = z.infer<typeof stateSchema>;
const EMPTY: RailState = { tags: [], assign: {}, later: {}, order: [], collapsed: [] };
const ids = z.array(z.string().min(1).max(64)).min(1).max(200);

export const rpcContract = defineRpcContract({
  state_get: { input: z.null(), output: stateSchema },
  tag_create: { input: z.object({ name: z.string().trim().min(1).max(32), color: z.enum(TAG_COLORS) }), output: tagSchema },
  tag_update: { input: z.object({ id: z.string(), name: z.string().trim().min(1).max(32).optional(), color: z.enum(TAG_COLORS).optional() }), output: stateSchema },
  tag_delete: { input: z.object({ id: z.string() }), output: stateSchema },
  tag_apply: { input: z.object({ threadIds: ids, tagId: z.string(), on: z.boolean() }), output: stateSchema },
  later_set: { input: z.object({ threadIds: ids, reason: z.enum(["revisit", "done", "mistake"]).nullable() }), output: stateSchema },
  order_set: { input: z.object({ order: z.array(z.string().max(80)).max(200) }), output: stateSchema },
  collapsed_set: { input: z.object({ id: z.string().max(80), collapsed: z.boolean() }), output: stateSchema },
  forget_threads: { input: z.object({ threadIds: ids }), output: stateSchema },
  pool_account: {
    input: z.object({ provider: z.enum(["claude", "codex"]), sessionId: z.string().max(200).nullable() }),
    output: z.object({ accountId: z.string().nullable(), activeAccountId: z.string().nullable() }),
  },
});

function poolDbPath(): string {
  const dataDir = process.env.BB_DATA_DIR || path.join(os.homedir(), ".bb");
  return path.join(dataDir, "plugins", "account-pool", "data.db");
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("navaigate-skin loaded");

  let db: Database.Database | null = null;
  const open = (): Database.Database | null => {
    if (db) return db;
    const file = poolDbPath();
    if (!fs.existsSync(file)) return null;
    try {
      db = new Database(file, { readonly: true, fileMustExist: true });
      return db;
    } catch (e) {
      bb.log.warn(`account-pool db unavailable: ${String(e)}`);
      return null;
    }
  };
  bb.onDispose(() => {
    db?.close();
    db = null;
  });

  // Serialised read-modify-write over one kv record; every change is broadcast
  // so every open window (and the other Mac) refetches.
  let chain: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<RailState> => {
    const raw = await bb.storage.kv.get<unknown>("rail-state");
    const parsed = stateSchema.safeParse(raw);
    return parsed.success ? parsed.data : { ...EMPTY };
  };
  const mutate = (fn: (s: RailState) => RailState | void): Promise<RailState> => {
    const next = chain.then(async () => {
      const s = await read();
      const out = fn(s) ?? s;
      await bb.storage.kv.set("rail-state", out);
      bb.realtime.publish("rail-state", { at: Date.now() });
      return out;
    });
    chain = next.catch(() => undefined);
    return next;
  };

  bb.rpc.register(rpcContract, {
    state_get: () => read(),
    tag_create: async ({ name, color }) => {
      const tag = { id: `t_${randomUUID().slice(0, 8)}`, name, color };
      await mutate((s) => {
        if (s.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) throw new Error(`A tag called "${name}" already exists.`);
        if (s.tags.length >= 24) throw new Error("Tag limit reached (24).");
        s.tags.push(tag);
      });
      return tag;
    },
    tag_update: ({ id, name, color }) =>
      mutate((s) => {
        const t = s.tags.find((x) => x.id === id);
        if (!t) throw new Error("Tag not found.");
        if (name) t.name = name;
        if (color) t.color = color;
      }),
    tag_delete: ({ id }) =>
      mutate((s) => {
        s.tags = s.tags.filter((t) => t.id !== id);
        for (const k of Object.keys(s.assign)) {
          s.assign[k] = s.assign[k].filter((x) => x !== id);
          if (s.assign[k].length === 0) delete s.assign[k];
        }
      }),
    tag_apply: ({ threadIds, tagId, on }) =>
      mutate((s) => {
        if (!s.tags.some((t) => t.id === tagId)) throw new Error("Tag not found.");
        for (const id of threadIds) {
          const cur = new Set(s.assign[id] ?? []);
          if (on) cur.add(tagId);
          else cur.delete(tagId);
          if (cur.size) s.assign[id] = [...cur];
          else delete s.assign[id];
        }
      }),
    later_set: ({ threadIds, reason }) =>
      mutate((s) => {
        for (const id of threadIds) {
          if (reason) s.later[id] = { reason, at: Date.now() };
          else delete s.later[id];
        }
      }),
    order_set: ({ order }) =>
      mutate((s) => {
        s.order = order;
      }),
    collapsed_set: ({ id, collapsed }) =>
      mutate((s) => {
        const set = new Set(s.collapsed);
        if (collapsed) set.add(id);
        else set.delete(id);
        s.collapsed = [...set];
      }),
    forget_threads: ({ threadIds }) =>
      mutate((s) => {
        for (const id of threadIds) {
          delete s.assign[id];
          delete s.later[id];
        }
      }),
    pool_account: ({ provider, sessionId }) => {
      const conn = open();
      if (!conn) return { accountId: null, activeAccountId: null };
      try {
        const active = conn.prepare("SELECT account_id FROM pool_active_account WHERE provider = ?").get(provider) as
          | { account_id: string }
          | undefined;
        let pinned: { account_id: string } | undefined;
        if (sessionId) {
          // affinity_key is JSON: ["claude","host_…","session:<id>"]
          pinned = conn
            .prepare("SELECT account_id FROM pool_affinity WHERE affinity_key LIKE ? AND affinity_key LIKE ? ORDER BY last_used_at DESC LIMIT 1")
            .get(`["${provider}",%`, `%"session:${sessionId.replace(/[%_"\\]/g, "")}"]`) as { account_id: string } | undefined;
        }
        return { accountId: pinned?.account_id ?? null, activeAccountId: active?.account_id ?? null };
      } catch (e) {
        bb.log.warn(`pool lookup failed: ${String(e)}`);
        return { accountId: null, activeAccountId: null };
      }
    },
  });
}
