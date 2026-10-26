import { hyprctl, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const monitorTools: ToolModule = {
  tools: [
    {
      name: "list_monitors",
      description: "List all monitors with resolution, refresh rate, scale, and position",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_focused_monitor",
      description: "Get the currently focused monitor's details",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_monitor_dpms",
      description: "Turn monitor display on or off (DPMS power management)",
      inputSchema: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["on", "off"], description: "on or off" },
          monitor: { type: "string", description: "Monitor name (optional, all monitors if omitted)" },
        },
        required: ["state"],
      },
      annotations: WR,
    },
    {
      name: "enable_monitor",
      description: "Enable a disabled monitor with its default settings",
      inputSchema: {
        type: "object",
        properties: { monitor: { type: "string", description: "Monitor name (e.g. 'HDMI-A-1')" } },
        required: ["monitor"],
      },
      annotations: WR,
    },
    {
      name: "disable_monitor",
      description: "Disable a monitor (turns it off and removes from layout)",
      inputSchema: {
        type: "object",
        properties: { monitor: { type: "string", description: "Monitor name" } },
        required: ["monitor"],
      },
      annotations: WR,
    },
    {
      name: "set_monitor_scale",
      description: "Change a monitor's scaling factor",
      inputSchema: {
        type: "object",
        properties: {
          monitor: { type: "string", description: "Monitor name" },
          scale: { type: "number", description: "Scale factor (e.g. 1, 1.25, 1.5, 2)" },
        },
        required: ["monitor", "scale"],
      },
      annotations: WR,
    },
    {
      name: "mirror_monitor",
      description: "Mirror one monitor to another",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Source monitor name" },
          target: { type: "string", description: "Target monitor to mirror to" },
        },
        required: ["source", "target"],
      },
      annotations: WR,
    },
  ],

  handlers: {
    async list_monitors() {
      const mons = await hyprctl("monitors");
      if (!Array.isArray(mons)) return err("Could not list monitors");
      const lines = mons.map((m: any) =>
        `${m.name}: ${m.width}x${m.height}@${m.refreshRate}Hz scale:${m.scale} pos:${m.x},${m.y} active:${m.activeWorkspace?.name} focused:${m.focused}`
      );
      return ok(lines.join("\n"));
    },
    async get_focused_monitor() {
      const mons = await hyprctl("monitors");
      const focused = Array.isArray(mons) ? mons.find((m: any) => m.focused) : null;
      if (!focused) return err("No focused monitor found");
      return ok(`Name: ${focused.name}\nResolution: ${focused.width}x${focused.height}@${focused.refreshRate}Hz\nScale: ${focused.scale}\nPosition: ${focused.x},${focused.y}\nActiveWorkspace: ${focused.activeWorkspace?.name}\nDPMS: ${focused.dpmsStatus}`);
    },
    async set_monitor_dpms(args) {
      if (args.monitor) {
        await hyprctl("dispatch", [`dpms,${args.state},${args.monitor}`], false);
      } else {
        await hyprctl("dispatch", [`dpms,${args.state}`], false);
      }
      return ok(`DPMS set to ${args.state}${args.monitor ? ` for ${args.monitor}` : ""}`);
    },
    async enable_monitor(args) {
      await hyprctl("keyword", [`monitor`, `${args.monitor},preferred,auto,1`], false);
      return ok(`Monitor ${args.monitor} enabled`);
    },
    async disable_monitor(args) {
      await hyprctl("keyword", [`monitor`, `${args.monitor},disable`], false);
      return ok(`Monitor ${args.monitor} disabled`);
    },
    async set_monitor_scale(args) {
      await hyprctl("keyword", [`monitor`, `${args.monitor},preferred,auto,${args.scale}`], false);
      return ok(`Monitor ${args.monitor} scale set to ${args.scale}`);
    },
    async mirror_monitor(args) {
      await hyprctl("keyword", [`monitor`, `${args.target},preferred,auto,1,mirror,${args.source}`], false);
      return ok(`${args.target} now mirrors ${args.source}`);
    },
  },
};
