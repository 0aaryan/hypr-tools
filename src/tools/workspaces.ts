import { hyprctl, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

async function dispatch(cmd: string): Promise<string> {
  return hyprctl("dispatch", [cmd], false);
}

export const workspaceTools: ToolModule = {
  tools: [
    {
      name: "list_workspaces",
      description: "List all active workspaces with their IDs, names, and window counts",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_active_workspace",
      description: "Get information about the currently active workspace",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "switch_workspace",
      description: "Switch to a specific workspace by number",
      inputSchema: {
        type: "object",
        properties: { workspace: { type: "number", description: "Workspace number to switch to" } },
        required: ["workspace"],
      },
      annotations: WR,
    },
    {
      name: "move_workspace_to_monitor",
      description: "Move a workspace to a different monitor",
      inputSchema: {
        type: "object",
        properties: {
          workspace: { type: "number", description: "Workspace number" },
          monitor: { type: "string", description: "Monitor name (e.g. 'eDP-1', 'HDMI-A-1')" },
        },
        required: ["workspace", "monitor"],
      },
      annotations: WR,
    },
    {
      name: "create_workspace",
      description: "Switch to the first empty workspace (effectively creates a new workspace)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "next_workspace",
      description: "Switch to the next workspace",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "prev_workspace",
      description: "Switch to the previous workspace",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async list_workspaces() {
      const ws = await hyprctl("workspaces");
      if (!Array.isArray(ws)) return err("Could not list workspaces");
      const lines = ws.map((w: any) =>
        `Workspace ${w.id} (${w.name}): ${w.windows} window(s) — monitor: ${w.monitor}`
      );
      return ok(lines.join("\n") || "No workspaces");
    },
    async get_active_workspace() {
      const w = await hyprctl("activeworkspace");
      return ok(`Active workspace: ${w.id} (${w.name})\nMonitor: ${w.monitor}\nWindows: ${w.windows}`);
    },
    async switch_workspace(args) {
      await dispatch(`workspace,${args.workspace}`);
      return ok(`Switched to workspace ${args.workspace}`);
    },
    async move_workspace_to_monitor(args) {
      await dispatch(`moveworkspacetomonitor,${args.workspace},${args.monitor}`);
      return ok(`Workspace ${args.workspace} moved to ${args.monitor}`);
    },
    async create_workspace() {
      await dispatch("workspace,empty");
      const w = await hyprctl("activeworkspace");
      return ok(`Switched to empty workspace ${w.id}`);
    },
    async next_workspace() {
      await dispatch("workspace,+1");
      return ok("Switched to next workspace");
    },
    async prev_workspace() {
      await dispatch("workspace,-1");
      return ok("Switched to previous workspace");
    },
  },
};
