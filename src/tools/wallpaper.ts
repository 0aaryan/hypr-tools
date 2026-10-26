import { safeExec, ok, err, scriptPath, type ToolModule } from "../utils.js";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const CACHE = resolve(homedir(), ".cache/hyde");

export const wallpaperTools: ToolModule = {
  tools: [
    {
      name: "get_wallpaper",
      description: "Get the file path of the currently active wallpaper",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_wallpaper",
      description: "Set wallpaper to a specific image file path",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "Absolute path to image file" } },
        required: ["path"],
      },
      annotations: WR,
    },
    {
      name: "next_wallpaper",
      description: "Switch to the next wallpaper in the current theme rotation",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "prev_wallpaper",
      description: "Switch to the previous wallpaper in the current theme rotation",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "list_wallpapers",
      description: "List all wallpaper files in the current theme directory",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "list_theme_wallpapers",
      description: "List all wallpaper files for a specific theme",
      inputSchema: {
        type: "object",
        properties: { theme: { type: "string", description: "Theme name" } },
        required: ["theme"],
      },
      annotations: RO,
    },
    {
      name: "get_wallpaper_colors",
      description: "Get the extracted color palette from the current wallpaper (wallbash colors)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
  ],

  handlers: {
    async get_wallpaper() {
      const r = await safeExec("swww", ["query"]);
      if (r.stdout) {
        const match = r.stdout.match(/image: (.+)/);
        return ok(match ? `Current wallpaper: ${match[1]}` : r.stdout);
      }
      return err("swww not running or no wallpaper set");
    },
    async set_wallpaper(args) {
      const r = await safeExec(scriptPath("swwwallpaper.sh"), ["-s", args.path], 15000);
      return r.exitCode === 0 ? ok(`Wallpaper set to: ${args.path}`) : err(`Failed: ${r.stderr || r.stdout}`);
    },
    async next_wallpaper() {
      const r = await safeExec(scriptPath("swwwallpaper.sh"), ["-n"], 15000);
      return ok("Switched to next wallpaper");
    },
    async prev_wallpaper() {
      const r = await safeExec(scriptPath("swwwallpaper.sh"), ["-p"], 15000);
      return ok("Switched to previous wallpaper");
    },
    async list_wallpapers() {
      try {
        const themePath = resolve(homedir(), ".config/hyde/themes");
        // Read current theme from hyde.conf
        const r = await safeExec("bash", ["-c", "grep '^hydeTheme=' ~/.config/hyde/hyde.conf 2>/dev/null || grep '^HYDE_THEME=' ~/.config/hyde/hyde.conf 2>/dev/null"]);
        const theme = r.stdout.split("=")[1]?.replace(/['"]/g, "").trim();
        if (!theme) return err("Could not determine current theme");
        const wallDir = resolve(themePath, theme, "wallpapers");
        const files = readdirSync(wallDir).filter(f => /\.(png|jpg|jpeg|webp|bmp)$/i.test(f));
        return ok(`Wallpapers in ${theme}:\n${files.join("\n")}`);
      } catch (e: any) {
        return err(`Could not list wallpapers: ${e.message}`);
      }
    },
    async list_theme_wallpapers(args) {
      try {
        const wallDir = resolve(homedir(), ".config/hyde/themes", args.theme, "wallpapers");
        const files = readdirSync(wallDir).filter(f => /\.(png|jpg|jpeg|webp|bmp)$/i.test(f));
        return ok(`Wallpapers in ${args.theme}:\n${files.join("\n")}`);
      } catch (e: any) {
        return err(`Theme not found or no wallpapers: ${e.message}`);
      }
    },
    async get_wallpaper_colors() {
      try {
        const dcol = resolve(CACHE, "wall.dcol");
        const colors = readFileSync(dcol, "utf-8").trim();
        return ok(`Wallbash colors:\n${colors}`);
      } catch {
        return err("No wallbash colors found — wallpaper may not have been processed yet");
      }
    },
  },
};
