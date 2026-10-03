// Agents: the orchestration space on the right of any chat.
//   Map   the chat's family tree (root, sub-agents, their sub-agents) with live
//         state, harness and background work, drawn as a pipeline.
//   Log   status changes as they happen while the panel is open.
//   Fleet every agent defined in ~/.claude/agents, one click to pick it.
//   Spin  start a new agent under this chat: a role preset or a fleet agent,
//         harness + model from bb's own picker, a prompt, same workspace.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  experimental_ProviderModelPicker as ProviderModelPicker,
  experimental_useSidebarThreads as useSidebarThreads,
  useRpc,
  useSdk,
  type ExperimentalProviderModelPickerValue,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../server";
import { Boundary } from "./boundary";
import { GOLD, Node, ago, caps, harnessOf, stateOf, tnum, type State } from "./shared";

const STATE_LABEL: Record<State, string> = { running: "working", needs: "needs you", unread: "replied", parked: "idle" };
const STATE_TONE: Record<State, string> = { running: GOLD, needs: "var(--destructive)", unread: "var(--foreground)", parked: "var(--muted-foreground)" };

const ROLES: Array<{ key: string; label: string; brief: string }> = [
  { key: "explorer", label: "Explorer", brief: "You are an explorer sub-agent. Read the code and files relevant to the task below and report back what you find, with paths. Do not edit anything.\n\nTask: " },
  { key: "worker", label: "Worker", brief: "You are a worker sub-agent. Make the change below, run the relevant tests, and report what you changed and the test result.\n\nTask: " },
  { key: "reviewer", label: "Reviewer", brief: "You are a reviewer sub-agent. Review the work below for correctness, security and maintainability. Report findings ranked by severity; do not edit.\n\nReview: " },
  { key: "researcher", label: "Researcher", brief: "You are a researcher sub-agent. Research the question below, cite sources, and report a short answer first, then the evidence.\n\nQuestion: " },
];

/* ------------------------------ the log ------------------------------ */

type LogRow = { at: number; threadId: string; title: string; from: State | "new"; to: State };
const log: LogRow[] = [];
const seen = new Map<string, State>();

function useFamily(threadId: string) {
  const { status, threads } = useSidebarThreads();
  return useMemo(() => {
    const byId = new Map(threads.map((t) => [t.id, t]));
    const kids = new Map<string, PluginSidebarThread[]>();
    for (const t of threads) {
      if (!t.parentThreadId) continue;
      const list = kids.get(t.parentThreadId) ?? [];
      list.push(t);
      kids.set(t.parentThreadId, list);
    }
    for (const list of kids.values()) list.sort((a, b) => a.createdAt - b.createdAt);
    let root = byId.get(threadId) ?? null;
    for (let guard = 0; root?.parentThreadId && byId.has(root.parentThreadId) && guard < 12; guard++) root = byId.get(root.parentThreadId)!;
    const family: PluginSidebarThread[] = [];
    const walk = (t: PluginSidebarThread) => {
      family.push(t);
      for (const k of kids.get(t.id) ?? []) walk(k);
    };
    if (root) walk(root);
    return { status, root, kids, family };
  }, [threads, status, threadId]);
}

/* ------------------------------ the map ------------------------------ */

function AgentCard({ t, current, depth }: { t: PluginSidebarThread; current: boolean; depth: number }) {
  const s = stateOf(t);
  const h = harnessOf(t.providerId);
  const bg = t.activity.backgroundAgents + t.activity.workflows;
  return (
    <a
      href={t.href}
      className={cn(
        "block rounded-md border bg-card px-2.5 py-2 no-underline transition-[border-color,transform] hover:-translate-y-px",
        current ? "border-[color:var(--attention)]" : "border-border",
      )}
      style={{ borderLeft: `3px solid ${STATE_TONE[s]}` }}
    >
      <div className="flex items-center gap-2">
        <Node state={s} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">{t.displayTitle}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{h.label}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 pl-[19px] text-[11px] text-muted-foreground" style={tnum}>
        <span style={{ color: STATE_TONE[s] }}>{STATE_LABEL[s]}</span>
        {bg > 0 ? <span>· {bg} in background</span> : null}
        {depth === 0 ? <span>· lead</span> : null}
        {current ? <span className="ml-auto" style={{ color: GOLD }}>this chat</span> : null}
      </div>
    </a>
  );
}

function Branch({ t, kids, current, depth }: { t: PluginSidebarThread; kids: Map<string, PluginSidebarThread[]>; current: string; depth: number }) {
  const children = kids.get(t.id) ?? [];
  return (
    <div>
      <AgentCard t={t} current={t.id === current} depth={depth} />
      {children.length > 0 ? (
        <div className="ml-[13px] mt-1 border-l border-dashed border-border pl-3">
          {children.map((c) => (
            <div key={c.id} className="relative mt-1.5">
              <span aria-hidden className="absolute -left-3 top-[17px] h-px w-3 bg-border" />
              <Branch t={c} kids={kids} current={current} depth={depth + 1} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ the fleet ---------------------------- */

type FleetAgent = { name: string; description: string; model: string | null; color: string | null; file: string };
let fleetCache: FleetAgent[] | null = null;

function useFleet() {
  const rpc = useRpc<typeof rpcContract>();
  const [agents, setAgents] = useState<FleetAgent[] | null>(fleetCache);
  useEffect(() => {
    rpc.call("agents_list").then(
      (r) => {
        fleetCache = r.agents;
        setAgents(r.agents);
      },
      () => setAgents((a) => a ?? []),
    );
  }, [rpc]);
  return agents;
}

const AGENT_COLOURS: Record<string, string> = { red: "#E8796A", orange: "#E8975A", yellow: "#D4A354", green: "#86C98A", blue: "#7AA2F7", purple: "#B9A2E8", pink: "#E59AC0", cyan: "#6FB8A6" };

function Fleet({ chosen, onChoose }: { chosen: string | null; onChoose: (a: FleetAgent) => void }) {
  const agents = useFleet();
  const [q, setQ] = useState("");
  if (!agents) return <p className="text-[11.5px] text-muted-foreground">Loading your agents…</p>;
  if (agents.length === 0) return <p className="text-[11.5px] text-muted-foreground">No agents found in ~/.claude/agents.</p>;
  const needle = q.trim().toLowerCase();
  const shown = needle ? agents.filter((a) => a.name.includes(needle) || a.description.toLowerCase().includes(needle)) : agents;
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Filter ${agents.length} agents`}
        className="mb-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[color:var(--attention)]"
      />
      {shown.map((a) => (
        <button
          key={a.name}
          type="button"
          onClick={() => onChoose(a)}
          className={cn(
            "group mb-1 block w-full rounded-md border px-2.5 py-1.5 text-left transition-colors",
            chosen === a.name ? "border-[color:var(--attention)] bg-card" : "border-transparent hover:border-border hover:bg-card",
          )}
        >
          <span className="flex items-center gap-2">
            <i className="inline-block size-2 shrink-0" style={{ background: AGENT_COLOURS[a.color ?? ""] ?? "var(--muted-foreground)" }} />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{a.name}</span>
            {a.model ? <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{a.model}</span> : null}
            <span className="shrink-0 text-[11px] opacity-0 transition-opacity group-hover:opacity-100" style={{ color: GOLD }}>
              pick
            </span>
          </span>
          <span className="mt-0.5 block overflow-hidden pl-4 text-[11px] leading-snug text-muted-foreground" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.description}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ the form ----------------------------- */

function SpinUp({ threadId, root, fleetAgent, clearFleet }: { threadId: string; root: PluginSidebarThread; fleetAgent: FleetAgent | null; clearFleet: () => void }) {
  const sdk = useSdk();
  const [envId, setEnvId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("explorer");
  const [task, setTask] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<ExperimentalProviderModelPickerValue>({ providerId: root.providerId, model: "", reasoningLevel: "medium" });

  useEffect(() => {
    let live = true;
    sdk.threads
      .get({ threadId })
      .then((t) => live && setEnvId((t as { environmentId?: string | null }).environmentId ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sdk, threadId]);

  const go = async () => {
    const text = task.trim();
    if (!text || busy) return;
    const r = fleetAgent
      ? { label: fleetAgent.name, brief: `Act as the ${fleetAgent.name} agent. Read your full instructions in ${fleetAgent.file} first and follow them.\n\nTask: ` }
      : ROLES.find((x) => x.key === role);
    setBusy(true);
    try {
      const made = await sdk.threads.spawn({
        projectId: root.projectId,
        environment: envId ? { type: "reuse", environmentId: envId } : { type: "project-default" },
        parentThreadId: threadId,
        providerId: pick.providerId,
        ...(pick.model ? { model: pick.model } : {}),
        ...(pick.reasoningLevel ? { reasoningLevel: pick.reasoningLevel } : {}),
        title: (title.trim() || `${r?.label ?? "Agent"} · ${text.slice(0, 48)}`).slice(0, 90),
        visibility: "visible",
        prompt: (r?.brief ?? "") + text,
      } as Parameters<typeof sdk.threads.spawn>[0]);
      toast.success(`Started ${r?.label ?? "agent"}`, { description: (made as { title?: string | null }).title ?? undefined });
      setTask("");
      setTitle("");
      clearFleet();
    } catch (e) {
      toast.error("Could not start the agent", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border px-3 pb-3 pt-2.5">
      <div className={cn(caps, "mb-2")}>Spin up an agent</div>
      <div className="mb-2 flex flex-wrap gap-1">
        {fleetAgent ? (
          <button
            type="button"
            onClick={clearFleet}
            title="Clear and go back to the role presets"
            className="rounded-full border border-[color:var(--attention)] bg-[color:var(--attention)] px-2.5 py-0.5 font-mono text-[11.5px] text-[#202225]"
          >
            {fleetAgent.name} ×
          </button>
        ) : null}
        {fleetAgent ? null : ROLES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRole(r.key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors",
              role === r.key ? "border-[color:var(--attention)] bg-[color:var(--attention)] text-[#202225]" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="mb-2">
        <Boundary label="Model picker" compact>
          <ProviderModelPicker value={pick} onChange={setPick} routing={envId ? { kind: "environment", environmentId: envId } : undefined} align="start" />
        </Boundary>
      </div>
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void go();
        }}
        rows={3}
        placeholder={fleetAgent ? `What should ${fleetAgent.name} do?` : "What should it do?"}
        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[color:var(--attention)]"
      />
      <div className="mt-2 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name (optional)"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[color:var(--attention)]"
        />
        <button
          type="button"
          disabled={!task.trim() || busy}
          onClick={() => void go()}
          className="shrink-0 rounded-md px-3 py-1.5 text-[12px] font-semibold text-[#202225] transition-opacity disabled:opacity-40"
          style={{ background: GOLD }}
        >
          {busy ? "Starting…" : "Spin up ⌘↵"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Runs as a child of this chat, in the same workspace. It shows up in the map above and in the rail.</p>
    </div>
  );
}

/* ------------------------------ the panel ---------------------------- */

export function AgentsPanel({ threadId }: { threadId: string }) {
  const { status, root, kids, family } = useFamily(threadId);
  const [, bump] = useState(0);
  const [tab, setTab] = useState<"run" | "fleet">("run");
  const [fleetAgent, setFleetAgent] = useState<FleetAgent | null>(null);
  const now = Date.now();
  const first = useRef(true);

  useEffect(() => {
    let changed = false;
    for (const t of family) {
      const s = stateOf(t);
      const prev = seen.get(t.id);
      if (prev === s) continue;
      seen.set(t.id, s);
      if (!first.current || prev === undefined) {
        if (prev !== undefined || !first.current) {
          log.unshift({ at: Date.now(), threadId: t.id, title: t.displayTitle, from: prev ?? "new", to: s });
          changed = true;
        }
      }
    }
    first.current = false;
    if (log.length > 60) log.length = 60;
    if (changed) bump((n) => n + 1);
  }, [family]);

  if (status === "loading") return <div className="p-4 text-[12px] text-muted-foreground">Loading agents…</div>;
  if (!root) return <div className="p-4 text-[12px] text-muted-foreground">This chat is not in the live list.</div>;

  const working = family.filter((t) => stateOf(t) === "running").length;
  const waiting = family.filter((t) => stateOf(t) === "needs").length;
  const ids = new Set(family.map((t) => t.id));
  const rows = log.filter((r) => ids.has(r.threadId)).slice(0, 14);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-3 border-b border-border px-3 py-2.5">
        <span className={caps}>Agents</span>
        <span className="text-[12px] text-foreground" style={tnum}>
          {family.length} in this run
        </span>
        <span className="ml-auto text-[11.5px]" style={{ ...tnum, color: working ? GOLD : "var(--muted-foreground)" }}>
          {working} working
        </span>
        {waiting ? (
          <span className="text-[11.5px] text-destructive" style={tnum}>
            {waiting} need you
          </span>
        ) : null}
      </div>
      <div className="flex gap-4 border-b border-border px-3">
        {(["run", "fleet"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("-mb-px border-b-2 py-1.5 text-[12px] transition-colors", tab === k ? "border-[color:var(--attention)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {k === "run" ? "This run" : "Your agents"}
          </button>
        ))}
      </div>
      {tab === "fleet" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <Fleet chosen={fleetAgent?.name ?? null} onChoose={(a) => setFleetAgent(a)} />
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Branch t={root} kids={kids} current={threadId} depth={0} />
        {family.length === 1 ? <p className="mt-3 text-[11.5px] text-muted-foreground">No sub-agents yet. Start one below and it appears here as a branch.</p> : null}
        <div className="mt-4">
          <div className={cn(caps, "mb-1.5")}>Session log</div>
          {rows.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground">Changes show here while this panel is open.</p>
          ) : (
            rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[52px_1fr_auto] gap-2 font-mono text-[11px] leading-[1.75]">
                <span className="text-muted-foreground" style={tnum}>{ago(r.at, now)}</span>
                <span className="truncate text-foreground/85">{r.title}</span>
                <span style={{ color: STATE_TONE[r.to] }}>{r.from === "new" ? "started" : STATE_LABEL[r.to]}</span>
              </div>
            ))
          )}
        </div>
      </div>
      )}
      <SpinUp threadId={threadId} root={family.find((t) => t.id === threadId) ?? root} fleetAgent={fleetAgent} clearFleet={() => setFleetAgent(null)} />
    </div>
  );
}
