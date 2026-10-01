---
name: navaigate-charts
description: Draw real charts inside a bb reply with the ::nav-chart directive (bars, stats, split, steps) in the NavAIgate look. Use whenever a reply carries three or more numbers, a comparison, a breakdown, a plan with status, or progress — show it, do not just list it.
---

# ::nav-chart — charts inside replies

The NavAIgate Skin plugin renders a `::nav-chart{...}` line in an assistant
message as a styled chart that follows the active theme (light and dark).
Put it on its own line, never inside backticks or a code fence, and emit the
whole directive in one piece.

## Kinds

- `bars` (default): ranked comparison. `highlight="<label>"` paints that bar gold and quiets the rest.
- `stats`: a row of up to four big tabular numerals (KPIs).
- `split`: one 100% bar plus a legend with share percentages (a breakdown of a whole).
- `steps`: a run-sheet timeline. Values are `done`, `now`, `next` or `blocked` instead of numbers.

## Attributes

- `data` (required): `Label:value,Label:value` (up to 24 points; labels must not contain commas).
- `title`: short caps caption.
- `unit`: appended to values (`h`, `%`, `€`, `threads`).
- `note`: one-line source or caveat under a hairline. Always cite where the numbers came from.
- `highlight`: label to emphasise (bars, stats).

## Examples

::nav-chart{kind="bars" title="Threads by harness" data="Claude:32,Codex:14,Cursor:5" unit="threads" highlight="Claude" note="Source: bb thread list, 2 Oct 2026"}

::nav-chart{kind="stats" data="Running:2,Needs you:10,Parked:39" highlight="Needs you"}

::nav-chart{kind="split" title="Where the week went" data="Build:14,Client calls:6,Admin:3" unit="h"}

::nav-chart{kind="steps" title="Skin rollout" data="Theme:done,Rail:done,Control room:now,Charts:next"}

## Rules

- Real numbers only, with a `note` naming the source. Never invent data to fill a chart.
- One chart per point you are making; keep the prose around it short.
- If a value is unknown, leave it out rather than writing 0.
