import { safeExec, hyprctl, ok, err, scriptPath, type ToolModule } from "../utils.js";

const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const RO = { readOnlyHint: true, openWorldHint: false };
const DES = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

export const sessionTools: ToolModule = {
  tools: [
    {
      name: "lock_screen",
      description: "Lock the screen using the configured screen locker (swaylock/hyprlock)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "toggle_idle_inhibitor",
      description: "Prevent or allow the screen from timing out / going idle",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "toggle_gamemode",
      description: "Toggle gamemode: disables animations, blur, and other effects for performance",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "get_gamemode_status",
      description: "Check if gamemode (performance mode) is currently active",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "suspend_system",
      description: "Suspend the system to RAM (sleep). WARNING: This will suspend your machine immediately.",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: DES,
    },
  ],

  handlers: {
    async lock_screen() {
      // Try hyprlock first, fall back to swaylock
      const hyprlock = await safeExec("which", ["hyprlock"]);
      if (hyprlock.exitCode === 0) {
        await safeExec("bash", ["-c", "hyprlock &"], 3000);
      } else {
        await safeExec("bash", ["-c", "swaylock &"], 3000);
      }
      return ok("Screen locked");
    },
    async toggle_idle_inhibitor() {
      const check = await safeExec("pgrep", ["-x", "hypridle"]);
      if (check.stdout) {
        await safeExec("pkill", ["-x", "hypridle"]);
        return ok("Idle inhibitor enabled (hypridle stopped)");
      } else {
        await safeExec("bash", ["-c", "hypridle &"], 3000);
        return ok("Idle inhibitor disabled (hypridle started)");
      }
    },
    async toggle_gamemode() {
      const r = await safeExec(scriptPath("gamemode.sh"), [], 10000);
      return ok(r.stdout || "Gamemode toggled");
    },
    async get_gamemode_status() {
      const opt = await hyprctl("getoption", ["animations:enabled"]);
      const animsOff = opt?.int === 0;
      return ok(animsOff ? "Gamemode: ACTIVE (animations disabled)" : "Gamemode: inactive");
    },
    async suspend_system() {
      await safeExec("systemctl", ["suspend"]);
      return ok("System suspended");
    },
  },
};
