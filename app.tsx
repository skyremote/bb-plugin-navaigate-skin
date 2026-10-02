// bb-plugin-navaigate-skin — the NavAIgate platform look for bb.
//
//   Rail          experimental_threadList   run-sheet sidebar, real folders, harness marks, right-click
//   Control room  homepageSection           one strip across every harness
//   ::nav-chart   messageDirective          charts inside replies
//   Usage dock    experimental_appOverlay   context + plan limits under the chat box
//
// Styling follows the GPLS Slate system (NavAIgate-2.0 src/styles/gpls-*.css).
// Colours come only from host tokens; the bundled NavAIgate theme drives them.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { Rail } from "./src/rail";
import { ControlRoom } from "./src/control-room";
import { NavChart } from "./src/chart";
import { UsageDock } from "./src/usage-dock";
import { toggleMode } from "./src/mode-toggle";
import { TodoBoard, TodoHeaderButton, TodoPanel } from "./src/todo";
import { VoiceEngine, VoiceHeaderButton, VoicePanel, voice } from "./src/voice";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "rail",
    title: "NavAIgate rail",
    description: "Run-sheet sidebar: NOW card, harness filter, real folders from project-folders, right-click on everything.",
    component: Rail,
  });
  app.slots.homepageSection({ id: "control-room", title: "Control room", component: ControlRoom });
  app.slots.messageDirective({ id: "nav-chart", component: NavChart });
  app.slots.experimental_appOverlay({ id: "usage-dock", component: UsageDock });
  // To-do: right-hand panel in any chat, a Board page, a header button and ⌘⇧D.
  app.slots.threadPanelAction({
    id: "todo",
    title: "To-do",
    icon: "navaigate-skin/todo",
    layout: "flush",
    component: ({ threadId }) => <TodoPanel threadId={threadId} />,
  });
  app.slots.experimental_threadHeaderAction({ id: "todo-button", title: "To-do", component: ({ threadId }) => <TodoHeaderButton threadId={threadId} /> });
  app.slots.navPanel({ id: "board", title: "Board", icon: "navaigate-skin/board", path: "board", component: () => <TodoBoard /> });
  app.commands.register({
    id: "open-todo",
    title: "Workspace: open to-do",
    defaultShortcut: { key: "d", mod: true, shift: true },
    run: (ctx) => {
      if (ctx.threadId && ctx.openPanel({ actionId: "todo", title: "To-do" })) return;
      window.history.pushState({}, "", "/plugins/navaigate-skin/board");
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    },
  });
  // Voice agent (Savvy on ElevenLabs): one engine for the whole window, a Talk
  // button in each chat header, a Voice tab with the transcript, and ⌘⇧E.
  app.slots.experimental_appOverlay({ id: "voice-engine", component: VoiceEngine });
  app.slots.threadPanelAction({ id: "voice", title: "Voice", icon: "Mic", layout: "flush", component: () => <VoicePanel /> });
  app.slots.experimental_threadHeaderAction({ id: "voice-button", title: "Talk to Savvy", component: () => <VoiceHeaderButton /> });
  app.commands.register({
    id: "voice-toggle",
    title: "Workspace: talk to Savvy",
    defaultShortcut: { key: "e", mod: true, shift: true },
    run: (ctx) => {
      if (ctx.threadId) ctx.openPanel({ actionId: "voice", title: "Voice" });
      voice.toggle();
    },
  });
  app.experimental_sidebarFooter.register({
    kind: "action",
    id: "light-dark",
    label: "Switch light / dark mode",
    icon: "navaigate-skin/contrast",
    onActivate: () => toggleMode(),
  });
});
