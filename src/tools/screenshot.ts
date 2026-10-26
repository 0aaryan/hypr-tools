import { safeExec, ok, err, type ToolModule } from "../utils.js";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

const SCREENSHOT_DIR = resolve(homedir(), "Pictures/Screenshots");
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

function ensureDir() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function filename(): string {
  const d = new Date();
  return `screenshot_${d.toISOString().replace(/[:.]/g, "-")}.png`;
}

export const screenshotTools: ToolModule = {
  tools: [
    {
      name: "screenshot_full",
      description: "Take a screenshot of all monitors and save to ~/Pictures/Screenshots/",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "screenshot_monitor",
      description: "Take a screenshot of the currently focused monitor",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "screenshot_region",
      description: "Take a screenshot of a user-selected region (opens slurp selector)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "screenshot_window",
      description: "Take a screenshot of the currently focused window",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "screenshot_to_clipboard",
      description: "Take a screenshot of a region and copy directly to clipboard (no file saved)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async screenshot_full() {
      ensureDir();
      const f = resolve(SCREENSHOT_DIR, filename());
      const r = await safeExec("grimblast", ["save", "screen", f], 10000);
      return r.exitCode === 0 ? ok(`Screenshot saved: ${f}`) : err(`Failed: ${r.stderr}`);
    },
    async screenshot_monitor() {
      ensureDir();
      const f = resolve(SCREENSHOT_DIR, filename());
      const r = await safeExec("grimblast", ["save", "output", f], 10000);
      return r.exitCode === 0 ? ok(`Screenshot saved: ${f}`) : err(`Failed: ${r.stderr}`);
    },
    async screenshot_region() {
      ensureDir();
      const f = resolve(SCREENSHOT_DIR, filename());
      const r = await safeExec("grimblast", ["save", "area", f], 30000);
      return r.exitCode === 0 ? ok(`Screenshot saved: ${f}`) : err(`Failed: ${r.stderr}`);
    },
    async screenshot_window() {
      ensureDir();
      const f = resolve(SCREENSHOT_DIR, filename());
      const r = await safeExec("grimblast", ["save", "active", f], 10000);
      return r.exitCode === 0 ? ok(`Screenshot saved: ${f}`) : err(`Failed: ${r.stderr}`);
    },
    async screenshot_to_clipboard() {
      const r = await safeExec("grimblast", ["copy", "area"], 30000);
      return r.exitCode === 0 ? ok("Screenshot copied to clipboard") : err(`Failed: ${r.stderr}`);
    },
  },
};
