import { hyprctl, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DES = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

async function dispatch(cmd: string): Promise<string> {
  return hyprctl("dispatch", [cmd], false);
}

export const windowTools: ToolModule = {
  tools: [
    {
      name: "list_windows",
      description: "List all open windows with title, class, workspace, position, and size",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_focused_window",
      description: "Get details of the currently focused/active window",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "focus_window",
      description: "Focus a window by its class name or title substring",
      inputSchema: {
        type: "object",
        properties: {
          class: { type: "string", description: "Window class to focus (e.g. 'firefox', 'kitty')" },
          title: { type: "string", description: "Window title substring to focus" },
        },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "close_window",
      description: "Gracefully close the focused window (or by address)",
      inputSchema: {
        type: "object",
        properties: { address: { type: "string", description: "Window address (hex). Omit for focused window." } },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "kill_window",
      description: "Force kill a window by address (use as last resort)",
      inputSchema: {
        type: "object",
        properties: { address: { type: "string", description: "Window address (hex). Omit for focused." } },
        required: [],
      },
      annotations: DES,
    },
    {
      name: "toggle_float",
      description: "Toggle floating mode on the focused window",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "toggle_fullscreen",
      description: "Toggle fullscreen on the focused window",
      inputSchema: {
        type: "object",
        properties: { mode: { type: "number", enum: [0, 1, 2], description: "0=real, 1=maximize, 2=no gaps (default 0)" } },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "pin_window",
      description: "Toggle always-on-top pin on the focused window",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "move_window_to_workspace",
      description: "Move the focused window to a specific workspace number",
      inputSchema: {
        type: "object",
        properties: {
          workspace: { type: "number", description: "Target workspace number" },
          silent: { type: "boolean", description: "If true, don't follow the window (default false)" },
        },
        required: ["workspace"],
      },
      annotations: WR,
    },
    {
      name: "resize_window",
      description: "Resize the focused window by a pixel delta",
      inputSchema: {
        type: "object",
        properties: {
          width: { type: "number", description: "Pixel change for width (negative to shrink)" },
          height: { type: "number", description: "Pixel change for height (negative to shrink)" },
        },
        required: ["width", "height"],
      },
      annotations: WR,
    },
    {
      name: "move_window",
      description: "Move a floating window by a pixel delta",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "Pixel delta for X axis" },
          y: { type: "number", description: "Pixel delta for Y axis" },
        },
        required: ["x", "y"],
      },
      annotations: WR,
    },
    {
      name: "toggle_split",
      description: "Toggle horizontal/vertical split direction for the focused window",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "group_window",
      description: "Toggle window grouping (tabbed mode) on the focused window",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "move_to_scratchpad",
      description: "Move the focused window to the special scratchpad workspace",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async list_windows() {
      const clients = await hyprctl("clients");
      if (!Array.isArray(clients)) return err("Could not list windows");
      const lines = clients.map((c: any) =>
        `[${c.workspace?.name ?? "?"}] ${c.class} — "${c.title}" (${c.size?.[0]}x${c.size?.[1]} at ${c.at?.[0]},${c.at?.[1]}) addr:${c.address}`
      );
      return ok(lines.join("\n") || "No windows open");
    },
    async get_focused_window() {
      const w = await hyprctl("activewindow");
      if (!w || !w.address) return err("No focused window");
      return ok(`Class: ${w.class}\nTitle: ${w.title}\nWorkspace: ${w.workspace?.name}\nSize: ${w.size?.[0]}x${w.size?.[1]}\nPosition: ${w.at?.[0]},${w.at?.[1]}\nFloating: ${w.floating}\nFullscreen: ${w.fullscreen}\nAddress: ${w.address}`);
    },
    async focus_window(args) {
      if (args.class) {
        await dispatch(`focuswindow,${args.class}`);
        return ok(`Focused window: ${args.class}`);
      }
      if (args.title) {
        await dispatch(`focuswindow,title:${args.title}`);
        return ok(`Focused window with title: ${args.title}`);
      }
      return err("Provide either class or title");
    },
    async close_window(args) {
      if (args.address) {
        await dispatch(`closewindow,address:${args.address}`);
      } else {
        await dispatch("closewindow,activewindow");
      }
      return ok("Window closed");
    },
    async kill_window(args) {
      if (args.address) {
        await dispatch(`closewindow,address:${args.address}`);
      } else {
        await dispatch("killactive,");
      }
      return ok("Window killed");
    },
    async toggle_float() {
      await dispatch("togglefloating,");
      return ok("Float toggled");
    },
    async toggle_fullscreen(args) {
      const mode = args.mode ?? 0;
      await dispatch(`fullscreen,${mode}`);
      return ok(`Fullscreen toggled (mode ${mode})`);
    },
    async pin_window() {
      await dispatch("pin,");
      return ok("Window pin toggled");
    },
    async move_window_to_workspace(args) {
      const cmd = args.silent ? "movetoworkspacesilent" : "movetoworkspace";
      await dispatch(`${cmd},${args.workspace}`);
      return ok(`Window moved to workspace ${args.workspace}`);
    },
    async resize_window(args) {
      await dispatch(`resizeactive,${args.width} ${args.height}`);
      return ok(`Window resized by ${args.width}x${args.height}`);
    },
    async move_window(args) {
      await dispatch(`moveactive,${args.x} ${args.y}`);
      return ok(`Window moved by ${args.x},${args.y}`);
    },
    async toggle_split() {
      await dispatch("togglesplit,");
      return ok("Split direction toggled");
    },
    async group_window() {
      await dispatch("togglegroup,");
      return ok("Window grouping toggled");
    },
    async move_to_scratchpad() {
      await dispatch("movetoworkspacesilent,special");
      return ok("Window moved to scratchpad");
    },
  },
};
