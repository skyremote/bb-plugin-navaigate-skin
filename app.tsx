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
  app.experimental_sidebarFooter.register({
    kind: "action",
    id: "light-dark",
    label: "Switch light / dark mode",
    icon: "navaigate-skin/contrast",
    onActivate: () => toggleMode(),
  });
});
