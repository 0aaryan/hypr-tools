import { safeExec, ok, err, scriptPath, type ToolModule } from "../utils.js";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const themeTools: ToolModule = {
  tools: [
    {
      name: "get_current_theme",
      description: "Get the currently active HyDE theme name",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_theme",
      description: "Switch to a specific HyDE theme by name",
      inputSchema: {
        type: "object",
        properties: { theme: { type: "string", description: "Theme name to switch to" } },
        required: ["theme"],
      },
      annotations: WR,
    },
    {
      name: "next_theme",
      description: "Cycle to the next HyDE theme",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "prev_theme",
      description: "Cycle to the previous HyDE theme",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "list_themes",
      description: "List all installed HyDE themes",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_wallbash_mode",
      description: "Get current wallbash color mode (theme/auto/dark/light)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_wallbash_mode",
      description: "Set wallbash color mode",
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["theme", "auto", "dark", "light"], description: "Wallbash mode" },
        },
        required: ["mode"],
      },
      annotations: WR,
    },
    {
      name: "get_rofi_style",
      description: "Get the current rofi launcher style number",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_rofi_style",
      description: "Set rofi launcher style by number (1-12)",
      inputSchema: {
        type: "object",
        properties: { style: { type: "number", description: "Rofi style number (1-12)" } },
        required: ["style"],
      },
      annotations: WR,
    },
  ],

  handlers: {
    async get_current_theme() {
      const r = await safeExec("bash", ["-c", "grep '^hydeTheme=' ~/.config/hyde/hyde.conf 2>/dev/null || grep '^HYDE_THEME=' ~/.config/hyde/hyde.conf 2>/dev/null"]);
      const theme = r.stdout.split("=")[1]?.replace(/['"]/g, "").trim();
      return ok(theme ? `Current theme: ${theme}` : "Could not determine current theme");
    },
    async set_theme(args) {
      const r = await safeExec(scriptPath("themeswitch.sh"), ["-s", args.theme], 30000);
      return ok(`Theme switched to: ${args.theme}`);
    },
    async next_theme() {
      await safeExec(scriptPath("themeswitch.sh"), ["-n"], 30000);
      return ok("Switched to next theme");
    },
    async prev_theme() {
      await safeExec(scriptPath("themeswitch.sh"), ["-p"], 30000);
      return ok("Switched to previous theme");
    },
    async list_themes() {
      try {
        const themesDir = resolve(homedir(), ".config/hyde/themes");
        const dirs = readdirSync(themesDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
        return ok(`Installed themes:\n${dirs.join("\n")}`);
      } catch (e: any) {
        return err(`Could not list themes: ${e.message}`);
      }
    },
    async get_wallbash_mode() {
      const r = await safeExec("bash", ["-c", "grep '^wallbashMode=' ~/.config/hyde/hyde.conf 2>/dev/null || echo 'unknown'"]);
      const mode = r.stdout.split("=")[1]?.replace(/['"]/g, "").trim() ?? "unknown";
      return ok(`Wallbash mode: ${mode}`);
    },
    async set_wallbash_mode(args) {
      await safeExec(scriptPath("wallbashtoggle.sh"), ["-s", args.mode], 15000);
      return ok(`Wallbash mode set to: ${args.mode}`);
    },
    async get_rofi_style() {
      const r = await safeExec("bash", ["-c", "grep '^rofiStyle=' ~/.config/hyde/hyde.conf 2>/dev/null || echo 'unknown'"]);
      const style = r.stdout.split("=")[1]?.replace(/['"]/g, "").trim() ?? "unknown";
      return ok(`Rofi style: ${style}`);
    },
    async set_rofi_style(args) {
      const s = Math.max(1, Math.min(12, args.style));
      await safeExec(scriptPath("rofiselect.sh"), ["-s", String(s)], 10000);
      return ok(`Rofi style set to: ${s}`);
    },
  },
};
