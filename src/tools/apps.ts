import { safeExec, hyprctl, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DES = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

export const appTools: ToolModule = {
  tools: [
    {
      name: "launch_app",
      description: "Launch an application by name or command (runs detached via hyprctl dispatch exec)",
      inputSchema: {
        type: "object",
        properties: { command: { type: "string", description: "App name or full command to launch (e.g. 'firefox', 'kitty', 'code')" } },
        required: ["command"],
      },
      annotations: WR,
    },
    {
      name: "list_desktop_apps",
      description: "List all installed .desktop applications (filterable by name)",
      inputSchema: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Filter by app name substring (optional)" },
          limit: { type: "number", description: "Max results (default 30)" },
        },
        required: [],
      },
      annotations: RO,
    },
    {
      name: "kill_app",
      description: "Kill a running application by name or PID",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Process name to kill" },
          pid: { type: "number", description: "Process ID to kill (takes precedence over name)" },
          signal: { type: "string", enum: ["TERM", "KILL", "INT"], description: "Signal to send (default TERM)" },
        },
        required: [],
      },
      annotations: DES,
    },
    {
      name: "list_running_apps",
      description: "List running GUI applications (from Hyprland's client list)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
  ],

  handlers: {
    async launch_app(args) {
      await hyprctl("dispatch", [`exec,${args.command}`], false);
      return ok(`Launched: ${args.command}`);
    },
    async list_desktop_apps(args) {
      const r = await safeExec("bash", ["-c",
        "find /usr/share/applications /home/*/.local/share/applications -name '*.desktop' 2>/dev/null | xargs grep -l '^Name=' | while read f; do grep -m1 '^Name=' \"$f\" | cut -d= -f2; done | sort -u"
      ], 10000);
      let lines = r.stdout.split("\n").filter(Boolean);
      if (args.filter) {
        lines = lines.filter(l => l.toLowerCase().includes(args.filter.toLowerCase()));
      }
      lines = lines.slice(0, args.limit ?? 30);
      return ok(lines.join("\n") || "No desktop apps found");
    },
    async kill_app(args) {
      if (args.pid) {
        await safeExec("kill", [`-${args.signal ?? "TERM"}`, String(args.pid)]);
        return ok(`Sent ${args.signal ?? "TERM"} to PID ${args.pid}`);
      }
      if (args.name) {
        await safeExec("pkill", [`-${args.signal ?? "TERM"}`, args.name]);
        return ok(`Sent ${args.signal ?? "TERM"} to ${args.name}`);
      }
      return err("Provide either name or pid");
    },
    async list_running_apps() {
      const clients = await hyprctl("clients");
      if (!Array.isArray(clients)) return err("Could not list clients");
      const unique = new Map<string, string>();
      for (const c of clients) {
        if (c.class && !unique.has(c.class)) {
          unique.set(c.class, c.title);
        }
      }
      const lines = Array.from(unique.entries()).map(([cls, title]) => `${cls}: ${title}`);
      return ok(lines.join("\n") || "No running GUI apps");
    },
  },
};
