// More chat renderers ("mods"), alongside ::nav-chart.
//
//   ::nav-links{items="https://linkedin.com/... https://x.com/..." title="Posted" note="..."}
//     One card per link in the platform's own colour (LinkedIn blue, YouTube red,
//     X and Threads ink, GitHub, Instagram, TikTok, Facebook, Bluesky, the web).
//     Items are separated by spaces, commas or semicolons; prefix "Label=" to
//     name one, e.g. items="Guide=https://... Repo=https://github.com/..."
//
//   ::nav-pipeline{title="Agent stack" layers="Opus 5.5|main session|orange ; Worker|edits + tests|blue , Explorer|reads code|blue ; Opus 5.5|review + ship|orange" side="Fable|advisor, watches every turn|plum" log="23:51 worker|tests failed ; 23:52 fable|read the migration first"}
//     Layers run top to bottom (";" between layers, "," between boxes in a layer,
//     "Title|detail|tone" per box). Tones: gold, orange, blue, green, plum, red,
//     teal, ink. An optional side box sits on the left; an optional session log
//     sits underneath. legend="Opus|orange ; Sonnet workers|blue" names the colours.
import type { CSSProperties, ReactNode } from "react";
import type { PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { caps, tnum } from "./shared";

/* ------------------------------ links ------------------------------- */

type Platform = { key: string; name: string; color: string; ink?: string; glyph: ReactNode };

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-[15px]" fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);

const PLATFORMS: Array<{ test: RegExp } & Platform> = [
  { test: /(^|\.)linkedin\.com$/, key: "linkedin", name: "LinkedIn", color: "#0A66C2", glyph: <b className="text-[12px] font-bold tracking-tight">in</b> },
  { test: /(^|\.)(x|twitter)\.com$/, key: "x", name: "X", color: "#000000", ink: "#ffffff", glyph: svg("M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z") },
  { test: /(^|\.)threads\.(net|com)$/, key: "threads", name: "Threads", color: "#1c1c1e", ink: "#ffffff", glyph: <b className="text-[14px] font-semibold">@</b> },
  { test: /(^|\.)(youtube\.com|youtu\.be)$/, key: "youtube", name: "YouTube", color: "#FF0000", glyph: svg("M8.5 5.5v13l10.5-6.5-10.5-6.5Z") },
  { test: /(^|\.)instagram\.com$/, key: "instagram", name: "Instagram", color: "#E1306C", glyph: <b className="text-[11px] font-bold">IG</b> },
  { test: /(^|\.)tiktok\.com$/, key: "tiktok", name: "TikTok", color: "#010101", ink: "#25F4EE", glyph: <b className="text-[11px] font-bold">TT</b> },
  { test: /(^|\.)facebook\.com$/, key: "facebook", name: "Facebook", color: "#1877F2", glyph: <b className="text-[14px] font-bold">f</b> },
  { test: /(^|\.)bsky\.app$/, key: "bluesky", name: "Bluesky", color: "#1185FE", glyph: <b className="text-[11px] font-bold">bs</b> },
  { test: /(^|\.)github\.com$/, key: "github", name: "GitHub", color: "#24292F", ink: "#ffffff", glyph: svg("M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z") },
  { test: /(^|\.)navaigate\.dev$/, key: "navaigate", name: "navaigate.dev", color: "#202225", ink: "#D4A354", glyph: <b className="text-[12px] font-bold">N</b> },
];

function platformOf(url: URL): Platform {
  const host = url.hostname.replace(/^www\./, "");
  const hit = PLATFORMS.find((p) => p.test.test(host));
  if (hit) return hit;
  return { key: "web", name: host, color: "var(--attention)", ink: "#202225", glyph: svg("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.9 8ZM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96ZM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26Zm.84 2h2.95c.32 1.25.78 2.45 1.38 3.56A8.03 8.03 0 0 1 5.1 16Zm2.95-8H5.1a8.03 8.03 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.05 8ZM12 19.96A14.1 14.1 0 0 1 10.09 16h3.82A14.1 14.1 0 0 1 12 19.96ZM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4Zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56ZM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4h-3.38Z") };
}

function shortPath(url: URL): string {
  const p = (url.pathname + url.search).replace(/\/$/, "");
  return p.length > 42 ? `${p.slice(0, 40)}…` : p || "/";
}

function parseLinks(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(/[\s,;]+/)
    .map((tok) => tok.trim())
    .filter(Boolean)
    .slice(0, 24)
    .map((tok) => {
      const eq = tok.indexOf("=");
      const label = eq > 0 && !tok.slice(0, eq).includes("/") ? tok.slice(0, eq).replace(/_/g, " ") : null;
      const href = label ? tok.slice(eq + 1) : tok;
      try {
        const url = new URL(href);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        return { url, label };
      } catch {
        return null;
      }
    })
    .filter((x): x is { url: URL; label: string | null } => !!x);
}

export function NavLinks({ attributes, source }: PluginMessageDirectiveProps) {
  const links = parseLinks(attributes.items ?? attributes.data);
  if (links.length === 0) return <code className="text-[12px] text-destructive">{source}</code>;
  const title = attributes.title?.slice(0, 80);
  const note = attributes.note?.slice(0, 200);
  return (
    <figure className="my-3 max-w-[680px]">
      {title ? <figcaption className={cn(caps, "mb-2 text-foreground")}>{title}</figcaption> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {links.map(({ url, label }, i) => {
          const p = platformOf(url);
          return (
            <a
              key={i}
              href={url.toString()}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-w-0 items-center gap-3 overflow-hidden rounded-lg border border-border bg-card py-2.5 pl-2.5 pr-3 no-underline transition-[transform,border-color] hover:-translate-y-px"
              style={{ borderLeft: `3px solid ${p.color}` } as CSSProperties}
            >
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md" style={{ background: p.color, color: p.ink ?? "#ffffff" }}>
                {p.glyph}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-foreground">{label ?? p.name}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground" style={tnum}>
                  {url.hostname.replace(/^www\./, "")}
                  {shortPath(url)}
                </span>
              </span>
              <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </a>
          );
        })}
      </div>
      {note ? <p className="mt-2 text-[11.5px] text-muted-foreground">{note}</p> : null}
    </figure>
  );
}

/* ----------------------------- pipeline ----------------------------- */

const TONES: Record<string, string> = {
  gold: "#D4A354",
  orange: "#E8975A",
  blue: "#7AA2F7",
  green: "#86C98A",
  plum: "#B9A2E8",
  red: "#E8796A",
  teal: "#6FB8A6",
  ink: "var(--foreground)",
};
const DEFAULT_TONES = ["orange", "blue", "green", "plum", "gold", "teal"];

type Box = { title: string; detail: string; tone: string };

function parseBox(raw: string, fallbackTone: string): Box | null {
  const [title, detail = "", tone = ""] = raw.split("|").map((s) => s.trim());
  if (!title) return null;
  const t = tone.toLowerCase();
  return { title: title.slice(0, 48), detail: detail.slice(0, 80), tone: TONES[t] ? t : fallbackTone };
}

function BoxCard({ b, wide }: { b: Box; wide?: boolean }) {
  const c = TONES[b.tone];
  return (
    <div className={cn("min-w-0 rounded-md border bg-card px-3 py-2 text-center", wide ? "w-full max-w-[420px]" : "flex-1")} style={{ borderColor: c }}>
      <div className="truncate text-[12.5px] font-semibold" style={{ color: c }}>
        {b.title}
      </div>
      {b.detail ? <div className="mt-0.5 text-[11.5px] leading-snug text-foreground/85">{b.detail}</div> : null}
    </div>
  );
}

function Connector({ from, to, tone }: { from: number; to: number; tone: string }) {
  // A fan between a layer of `from` boxes and a layer of `to` boxes, drawn in a 100-wide box.
  const xs = (n: number) => Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * 100);
  const a = xs(from);
  const b = xs(to);
  const c = TONES[tone];
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="block h-6 w-full" aria-hidden>
      {a.flatMap((x1) =>
        b.map((x2) => (
          <path key={`${x1}-${x2}`} d={`M${x1} 0 C${x1} 12, ${x2} 12, ${x2} 22`} fill="none" stroke={c} strokeOpacity=".55" strokeWidth="0.6" vectorEffect="non-scaling-stroke" strokeDasharray={from > 1 && to > 1 ? "2 2" : undefined} />
        )),
      )}
      {b.map((x2) => (
        <circle key={x2} cx={x2} cy="22" r="1.1" fill={c} />
      ))}
    </svg>
  );
}

export function NavPipeline({ attributes, source }: PluginMessageDirectiveProps) {
  const layerSpecs = (attributes.layers ?? "").split(";").map((l) => l.trim()).filter(Boolean).slice(0, 6);
  let n = 0;
  const layers = layerSpecs
    .map((l) => l.split(",").map((b) => parseBox(b, DEFAULT_TONES[n++ % DEFAULT_TONES.length])).filter((x): x is Box => !!x).slice(0, 5))
    .filter((l) => l.length > 0);
  if (layers.length === 0) return <code className="text-[12px] text-destructive">{source}</code>;
  const side = attributes.side ? parseBox(attributes.side, "plum") : null;
  const log = (attributes.log ?? "")
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((r) => {
      const [head, text = ""] = r.split("|").map((s) => s.trim());
      const m = head.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*)$/);
      return { time: m ? m[1] : "", who: m ? m[2] : head, text };
    });
  const title = attributes.title?.slice(0, 80);
  // Legend: explicit legend="Opus|orange ; Sonnet workers|blue" wins; otherwise the
  // first box of each colour names it.
  const legend: Array<{ tone: string; label: string }> = attributes.legend
    ? attributes.legend.split(";").map((x) => x.split("|").map((s) => s.trim())).filter(([l, t]) => l && TONES[(t ?? "").toLowerCase()]).map(([l, t]) => ({ label: l.slice(0, 32), tone: t.toLowerCase() }))
    : Array.from(
        layers
          .flat()
          .concat(side ? [side] : [])
          .reduce((m, b) => (m.has(b.tone) ? m : m.set(b.tone, b.title.split(/\s|·/)[0])), new Map<string, string>()),
        ([tone, label]) => ({ tone, label }),
      );

  return (
    <figure className="my-3 max-w-[760px] overflow-hidden rounded-lg border border-border bg-card px-4 pb-3 pt-3 font-mono">
      {title ? <figcaption className="mb-2 text-center text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground">{title}</figcaption> : null}
      <div className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {legend.map((b) => (
          <span key={b.tone} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2" style={{ background: TONES[b.tone] }} />
            {b.label}
          </span>
        ))}
      </div>
      <div className={cn("grid gap-4", side ? "grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)]" : "grid-cols-1")}>
        {side ? (
          <div className="self-stretch rounded-md border border-dashed px-3 py-2.5" style={{ borderColor: TONES[side.tone] }}>
            <div className="text-[12.5px] font-semibold" style={{ color: TONES[side.tone] }}>
              {side.title}
            </div>
            <div className="mt-1 text-[11.5px] leading-snug text-foreground/85">{side.detail}</div>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col items-stretch">
          {layers.map((layer, i) => (
            <div key={i}>
              {i > 0 ? <Connector from={layers[i - 1].length} to={layer.length} tone={layer[0].tone} /> : null}
              <div className="flex justify-center gap-2">
                {layer.map((b, j) => (
                  <BoxCard key={j} b={b} wide={layer.length === 1} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {log.length > 0 ? (
        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">session log</div>
          {log.map((r, i) => {
            const tone = layers.flat().concat(side ? [side] : []).find((b) => b.title.toLowerCase().includes(r.who.toLowerCase()) || r.who.toLowerCase().includes(b.title.toLowerCase().split(/\s/)[0]));
            return (
              <div key={i} className="grid grid-cols-[64px_96px_1fr] gap-2 text-[11.5px] leading-[1.7]">
                <span className="text-muted-foreground" style={tnum}>{r.time}</span>
                <span className="truncate font-semibold" style={{ color: tone ? TONES[tone.tone] : undefined }}>{r.who}</span>
                <span className="truncate text-foreground/85">{r.text}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </figure>
  );
}
