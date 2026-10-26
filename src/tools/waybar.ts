import { safeExec, ok, err, scriptPath, type ToolModule } from "../utils.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const WAYBAR_DIR = resolve(homedir(), ".config/waybar");

export const waybarTools: ToolModule = {
  tools: [
    {
      name: "get_waybar_mode",
      description: "Get the currently active waybar layout mode (line number in config.ctl)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_waybar_mode",
      description: "Switch to a specific waybar layout by config.ctl line number",
      inputSchema: {
        type: "object",
        properties: { mode: { type: "number", description: "Layout line number in config.ctl" } },
        required: ["mode"],
      },
      annotations: WR,
    },
    {
      name: "next_waybar_mode",
      description: "Cycle to the next waybar layout mode",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "prev_waybar_mode",
      description: "Cycle to the previous waybar layout mode",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "toggle_waybar",
      description: "Show or hide waybar (toggle visibility)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async get_waybar_mode() {
      try {
        const ctl = readFileSync(resolve(WAYBAR_DIR, "config.ctl"), "utf-8");
        const lines = ctl.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("1|")) {
            return ok(`Active waybar mode: line ${i + 1}\nConfig: ${lines[i]}`);
          }
        }
        return ok("No active waybar mode found");
      } catch (e: any) {
        return err(`Could not read config.ctl: ${e.message}`);
      }
    },
    async set_waybar_mode(args) {
      await safeExec(scriptPath("wbarconfgen.sh"), [String(args.mode)], 10000);
      return ok(`Waybar mode set to ${args.mode}`);
    },
    async next_waybar_mode() {
      await safeExec(scriptPath("wbarconfgen.sh"), ["n"], 10000);
      return ok("Switched to next waybar mode");
    },
    async prev_waybar_mode() {
      await safeExec(scriptPath("wbarconfgen.sh"), ["p"], 10000);
      return ok("Switched to previous waybar mode");
    },
    async toggle_waybar() {
      await safeExec("killall", ["-SIGUSR1", "waybar"]);
      return ok("Waybar visibility toggled");
    },
  },
};
