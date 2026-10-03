# NavAIgate Workspace for bb

*(Installed as `navaigate-skin`; the id is kept so existing installs, tags and settings carry over.)*

**Guide and trailer:** https://skyremote.github.io/bb-plugin-navaigate-skin/

The NavAIgate platform look for [bb](https://getbb.app): warm paper and ink, gold for "now", no blue, in light and dark. It turns bb's sidebar into a run sheet you can organise, puts a live usage dock under the chat box, and lets agents draw real charts inside their replies.

## What you get

**Rail (the sidebar)**
- NOW card: what is cooking right now, with a lattice loader, and how many chats need you.
- Harness filter (All, Claude, Codex, Cursor and anything else you run) and your own **tags** beside it. Click a tag to filter, right-click to rename, recolour or delete, `+ Tag` to make one.
- **Come back later**: flag any chat as *revisit*, *done, check it* or *has a mistake*. Flagged chats move to their own section with an animated status mark so they cannot be missed.
- **Folders**: real folders on disk under each project (via the [project-folders](https://github.com/VKirill/bb-plugin-project-folders) plugin). Make new ones, add existing ones from the drive, drag chats in, drag folders into folders.
- **Sections you arrange**: click a heading to fold it, drag a heading to reorder. Order and folds are kept on your bb server, so every window shows the same layout.
- **Multi-select**: ⌘-click to toggle, ⇧-click for a range, or press **Select** for checkboxes. The bulk bar flags, tags, pins, archives or deletes in one go. Esc clears.
- Right-click on everything: chats, folders, project headings, tags.

**To-do, linked to where the work is**
- Say it in any chat: "we've got this, this and this to do". The agent's `workspace_todo` tool records one item per thing, linked to that chat.
- Open the **To-do panel** on the right from the header button or **⌘⇧D**. Scopes: *This chat*, *this folder* (or project), *Everything*. Paste a list to add several at once; click the mark to tick an item off; right-click to move, link to this chat or folder, rename or delete.
- Folders in the rail show how many items are open inside them.
- The **Board** (sidebar, *Board*) has four columns, *To do*, *Doing*, *Check*, *Done*, and moves on real signals rather than agents' self-reports: a linked chat that starts working moves its item to *Doing*; when every linked chat has finished it goes to *Check*. Nothing is ever moved to *Done* for you. Drag cards to override.
- Storage is bb's own **Tasks** plugin, so `bb tasks` and agents keep working. Each bb project gets a tracker project (for example `NAV`) the first time you add an item.

**Voice agent (Savvy)**: press **Talk** in a chat header (or ⌘⇧E) and speak. Savvy, an ElevenLabs agent on Eleven v4 Turbo, turns what you say into a clear prompt and sends it to the harness in the open chat, reads its status or last reply when you ask, stops it, or adds to-dos. When a harness finishes, Savvy tells you in a few sentences what was done, what's left and whether it needs you. The Voice tab on the right keeps the transcript. Needs an ElevenLabs API key (plugin setting, or `~/.elevenlabs/api_key`); the key stays on the bb server, which creates the agent once and hands the window short-lived session tokens. ElevenLabs bills the conversation minutes and the small model inside the agent (Gemini 2.5 Flash by default) to your ElevenLabs account; the real work stays in your harness.

**Control room** on the new-thread screen: running, needs you, unread and parked across every harness, with a split bar per harness.

**Usage dock** under the chat box (replaces bb's context ring): a comet-dial context gauge with the auto-compact point, plus the plan windows of the subscription this chat actually runs on. With bb's Account Pooler it follows the pooled account; otherwise it reads the local login.

**`::nav-chart`** directive for replies: `bars`, `stats`, `split` and `steps`. The bundled `navaigate-charts` skill tells agents how to use it.

**Light/dark toggle** in the sidebar footer.

**Theme**: the NavAIgate palette, IBM Plex type, a slightly looser spacing grid, warm terminal colours, a jelly-style reasoning picker, a voice pill on the mic and springy presses.

## Install

```sh
bb plugin install git:https://github.com/skyremote/bb-plugin-navaigate-skin.git@^0.8.3
bb theme set plugin:navaigate-skin:navaigate
bb settings ui set sidebar.threadListProvider '"navaigate-skin/rail"'
```

Recommended alongside: `project-folders` (folders) and bb's built-in Account Pooler (per-subscription usage). Without them the rail and dock still work; folders and pooled usage simply do not appear.

To go back to bb's own sidebar: Settings, Appearance, Sidebar.

## Charts in replies

```text
::nav-chart{kind="bars" title="Threads by harness" data="Claude:31,Codex:14,Cursor:4" unit="threads" highlight="Claude" note="Source: bb"}
::nav-chart{kind="stats" data="Running:2,Needs you:6,Parked:35"}
::nav-chart{kind="split" title="Where the week went" data="Build:14,Calls:6,Admin:3" unit="h"}
::nav-chart{kind="steps" title="Rollout" data="Theme:done,Rail:done,Dock:now,Publish:next"}
```

## Links and agent pipelines in replies

Two more renderers sit next to `::nav-chart`:

- `::nav-links{items="https://... https://..."}` turns a list of URLs into cards in each platform's own colour (LinkedIn blue, YouTube red, X and Threads black, GitHub, and more).
- `::nav-pipeline{layers="Lead|plans|orange ; Worker|edits|blue , Explorer|reads|blue" side="Advisor|watches|plum" log="23:51 Worker|tests failed"}` draws an agent stack with connectors and a session log.

The bundled `navaigate-charts` skill teaches agents all three.

## Agents panel (⌘⇧A)

A right-hand panel in every chat. **This run** maps the chat and every sub-agent under it, live, with a session log of status changes. **Your agents** lists every agent defined in `~/.claude/agents`, grouped like a crew: chief of staff, leads, teams that share a name prefix, then specialists (a `group:` line in an agent's front matter overrides this). Picking one puts it on the model its file pins, and leads default to running in their own chat so they can start sub-agents of their own. Pick a role preset or one of your agents, choose the harness and model with bb's own picker, write the task, and **Spin up** starts it as a child of the chat in the same workspace.

## Develop

```sh
npm install
bb plugin install .        # path install, live from this folder
bb plugin dev              # rebuild and reload on save
npx tsc --noEmit -p .      # typecheck
```

Layout: `app.tsx` registers the surfaces; `src/rail.tsx` (sidebar), `src/control-room.tsx`, `src/usage-dock.tsx`, `src/chart.tsx`, `src/tags.tsx`, `src/bulk-bar.tsx`, `src/status-mark.tsx`; `server.ts` holds the synced rail state, the to-do RPCs, the `workspace_todo` agent tool and the read-only Account Pooler lookup; `server-todo.ts` is the to-do engine on bb Tasks; `src/todo.tsx` the panel and Board; `themes/navaigate.css` is the palette and micro-interactions.

## Credits

Loader, status mark, comet dial, jelly radio and voice pill are original re-implementations inspired by components from [React Bits](https://reactbits.dev) by David Haz. Built by NavAIgate.
