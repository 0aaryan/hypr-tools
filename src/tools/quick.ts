import { safeExec, hyprctl, expandPath, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const quickTools: ToolModule = {
  tools: [
    {
      name: "open_url",
      description: "Open a URL in the default browser",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to open" },
        },
        required: ["url"],
      },
      annotations: WR,
    },
    {
      name: "open_file_manager",
      description: "Open the file manager at a given path",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to open (default: home)",
          },
        },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "open_terminal",
      description: "Open a new terminal window, optionally with a command or working directory",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Command to run in the terminal (optional)",
          },
          cwd: {
            type: "string",
            description: "Working directory (optional)",
          },
          title: {
            type: "string",
            description: "Terminal window title (optional)",
          },
        },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "trash_file",
      description:
        "Move a file to trash (recoverable, NOT permanent delete). Uses gio trash.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File or directory path to trash" },
        },
        required: ["path"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    {
      name: "show_desktop",
      description: "Minimize all windows to show the desktop",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async open_url(args) {
      await hyprctl("dispatch", [`exec,xdg-open ${args.url}`], false);
      return ok(`Opened: ${args.url}`);
    },

    async open_file_manager(args) {
      const path = args.path ? expandPath(args.path) : expandPath("~");
      await hyprctl("dispatch", [`exec,xdg-open ${path}`], false);
      return ok(`File manager opened at: ${path}`);
    },

    async open_terminal(args) {
      const parts = ["kitty"];
      if (args.title) parts.push("--title", args.title);
      if (args.cwd) parts.push("--directory", expandPath(args.cwd));
      if (args.command) parts.push("-e", "bash", "-c", args.command);
      await hyprctl("dispatch", [`exec,${parts.join(" ")}`], false);
      return ok(`Terminal opened${args.cwd ? ` at ${args.cwd}` : ""}${args.command ? ` running: ${args.command}` : ""}`);
    },

    async trash_file(args) {
      const path = expandPath(args.path);
      const r = await safeExec("gio", ["trash", path]);
      if (r.exitCode !== 0) return err(`Failed to trash: ${r.stderr}`);
      return ok(`Moved to trash: ${path}`);
    },

    async show_desktop() {
      // Get all windows and minimize them
      const clients = await hyprctl("clients");
      if (!Array.isArray(clients)) return err("Could not list windows");
      let count = 0;
      for (const c of clients) {
        if (c.mapped && !c.hidden) {
          await hyprctl("dispatch", [`movetoworkspacesilent,special:minimize,address:${c.address}`], false);
          count++;
        }
      }
      return ok(`Minimized ${count} window(s)`);
    },
  },
};
