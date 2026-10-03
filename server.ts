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
import { createTodoEngine, todoItemSchema, TODO_STATUSES } from "./server-todo";
import { createVoice } from "./server-voice";

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
  todo_list: { input: z.null(), output: z.object({ items: z.array(todoItemSchema), available: z.boolean() }) },
  todo_add: {
    input: z.object({
      titles: z.array(z.string().trim().min(1).max(300)).min(1).max(50),
      bbProjectId: z.string().min(1),
      bbProjectName: z.string().min(1).max(80),
      folderId: z.string().nullable(),
      threadId: z.string().nullable(),
    }),
    output: z.object({ keys: z.array(z.string()) }),
  },
  todo_status: { input: z.object({ taskId: z.string(), status: z.enum(TODO_STATUSES) }), output: z.object({ ok: z.boolean() }) },
  todo_move: {
    input: z.object({ taskId: z.string(), status: z.enum(TODO_STATUSES), beforeTaskId: z.string().nullable(), afterTaskId: z.string().nullable() }),
    output: z.object({ ok: z.boolean() }),
  },
  todo_rename: { input: z.object({ taskId: z.string(), title: z.string().trim().min(1).max(300) }), output: z.object({ ok: z.boolean() }) },
  todo_delete: { input: z.object({ taskId: z.string() }), output: z.object({ ok: z.boolean() }) },
  todo_link_thread: { input: z.object({ taskId: z.string(), threadId: z.string(), on: z.boolean() }), output: z.object({ ok: z.boolean() }) },
  todo_link_folder: { input: z.object({ taskId: z.string(), folderId: z.string().nullable() }), output: z.object({ ok: z.boolean() }) },
  agents_list: {
    input: z.null(),
    output: z.object({
      agents: z.array(z.object({ name: z.string(), description: z.string(), model: z.string().nullable(), color: z.string().nullable(), group: z.string().nullable(), file: z.string() })),
    }),
  },
  voice_status: { input: z.null(), output: z.object({ configured: z.boolean(), agentId: z.string().nullable() }) },
  voice_token: { input: z.null(), output: z.object({ token: z.string(), agentId: z.string() }) },
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

  const todo = createTodoEngine(bb);
  const voice = createVoice(bb);
  const ok = { ok: true };

  // Real-signal pass every 20s: chats starting or finishing move their tasks.
  bb.background.service("todo-sync", {
    async start(signal) {
      while (!signal.aborted) {
        await todo.sync().catch((e) => bb.log.warn(`todo sync: ${String(e)}`));
        await new Promise((r) => {
          const t = setTimeout(r, 20_000);
          signal.addEventListener("abort", () => { clearTimeout(t); r(null); }, { once: true });
        });
      }
    },
  });

  // "We've got this, this and this to do" -> tasks linked to the chat it was said in.
  bb.agents.registerTool({
    name: "workspace_todo",
    description:
      "Manage Daniel's to-do list in NavAIgate Workspace (stored in bb Tasks). action=add with items[] records each as a task linked to this chat; action=list shows open items for this chat; action=done marks keys (e.g. NAV-4) done.",
    instructions:
      "When Daniel lists things that need doing (\"we've got X, Y and Z to do\", \"add that to the list\", \"remind me to…\"), call workspace_todo with action=add and one short imperative item per thing. Do not mark items done unless he says so. Mention the keys you created.",
    presentation: { label: { pending: "Updating the to-do list", completed: "Updated the to-do list" } },
    parameters: z.object({
      action: z.enum(["add", "list", "done"]),
      items: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
      keys: z.array(z.string()).max(30).optional(),
    }),
    async execute({ action, items, keys }, { threadId, projectId }) {
      if (action === "add") {
        if (!items?.length) return "Nothing to add: pass items[].";
        if (!projectId) return "This chat has no project, so there is nowhere to file the to-do items.";
        const proj = await bb.sdk.projects.get({ projectId }).catch(() => null);
        const name = (proj as { name?: string } | null)?.name ?? "Personal";
        const created = await todo.add({ titles: items, bbProjectId: projectId, bbProjectName: name, folderId: null, threadId: threadId ?? null });
        return `Added ${created.length} to-do item${created.length === 1 ? "" : "s"}, linked to this chat: ${created.join(", ")}. Daniel sees them in the To-do panel (⌘⇧D) and on the Board.`;
      }
      const all = await todo.list();
      if (action === "done") {
        const wanted = new Set((keys ?? []).map((k) => k.toUpperCase()));
        const hit = all.filter((t) => wanted.has(t.key.toUpperCase()));
        for (const t of hit) await todo.setStatus(t.id, "done", "Agent");
        return hit.length ? `Marked done: ${hit.map((t) => t.key).join(", ")}.` : "No matching keys.";
      }
      const mine = all.filter((t) => t.threads.some((x) => x.threadId === threadId) && t.status !== "done" && t.status !== "canceled");
      return mine.length ? mine.map((t) => `${t.key} [${t.status}] ${t.title}`).join("\n") : "No open to-do items linked to this chat.";
    },
  });

  bb.rpc.register(rpcContract, {
    agents_list: () => ({ agents: listAgents() }),
    voice_status: () => voice.status(),
    voice_token: () => voice.token(),
    todo_list: async () => {
      try {
        return { items: await todo.list(), available: true };
      } catch (e) {
        bb.log.warn(`todo list: ${String(e)}`);
        return { items: [], available: false };
      }
    },
    todo_add: async (input) => ({ keys: await todo.add(input) }),
    todo_status: async ({ taskId, status }) => (await todo.setStatus(taskId, status), ok),
    todo_move: async ({ taskId, status, beforeTaskId, afterTaskId }) => (await todo.move(taskId, status, beforeTaskId, afterTaskId), ok),
    todo_rename: async ({ taskId, title }) => (await todo.rename(taskId, title), ok),
    todo_delete: async ({ taskId }) => (await todo.remove(taskId), ok),
    todo_link_thread: async ({ taskId, threadId, on }) => (await todo.linkThread(taskId, threadId, on), ok),
    todo_link_folder: async ({ taskId, folderId }) => (await todo.linkFolder(taskId, folderId), ok),
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

// Defined agents (Claude Code format: one .md per agent with YAML front matter)
// from ~/.claude/agents — the fleet the Agents panel can start with one click.
function listAgents() {
  const dir = path.join(os.homedir(), ".claude", "agents");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
  } catch {
    return [];
  }
  const out: Array<{ name: string; description: string; model: string | null; color: string | null; group: string | null; file: string }> = [];
  for (const f of files) {
    try {
      const text = fs.readFileSync(path.join(dir, f), "utf8").slice(0, 8000);
      const m = text.match(/^---\n([\s\S]*?)\n---/);
      if (!m) continue;
      const lines = m[1].split("\n");
      const field = (k: string) => {
        const i = lines.findIndex((l) => l.startsWith(`${k}:`));
        if (i < 0) return null;
        const v = lines[i].slice(k.length + 1).trim();
        // YAML block scalars (description: > or |): join the indented lines below.
        if (/^[>|][+-]?$/.test(v)) {
          const body: string[] = [];
          for (let j = i + 1; j < lines.length && (/^\s/.test(lines[j]) || lines[j] === ""); j++) body.push(lines[j].trim());
          return body.join(" ").replace(/\s+/g, " ").trim() || null;
        }
        return v.replace(/^["']|["']$/g, "") || null;
      };
      const name = field("name") ?? f.replace(/\.md$/, "");
      out.push({ name, description: (field("description") ?? "").slice(0, 220), model: field("model"), color: field("color"), group: field("group"), file: path.join(dir, f) });
    } catch {
      /* unreadable file: skip */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
