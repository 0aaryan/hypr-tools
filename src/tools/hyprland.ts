import { hyprctl, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const hyprlandTools: ToolModule = {
  tools: [
    {
      name: "hypr_reload",
      description: "Reload the Hyprland configuration",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "get_hypr_option",
      description: "Get a Hyprland config option's current value (e.g. 'general:border_size', 'decoration:rounding')",
      inputSchema: {
        type: "object",
        properties: { option: { type: "string", description: "Option name (e.g. 'general:border_size')" } },
        required: ["option"],
      },
      annotations: RO,
    },
    {
      name: "set_hypr_option",
      description: "Set a runtime Hyprland config option via keyword (non-persistent, resets on reload)",
      inputSchema: {
        type: "object",
        properties: {
          option: { type: "string", description: "Option name" },
          value: { type: "string", description: "Value to set" },
        },
        required: ["option", "value"],
      },
      annotations: WR,
    },
    {
      name: "get_hypr_binds",
      description: "List all active Hyprland keybindings",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "toggle_animations",
      description: "Toggle Hyprland animations on or off",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async hypr_reload() {
      await hyprctl("reload", [], false);
      return ok("Hyprland config reloaded");
    },
    async get_hypr_option(args) {
      const val = await hyprctl("getoption", [args.option]);
      if (typeof val === "object" && val !== null) {
        return ok(`${args.option}:\n  int: ${val.int ?? "N/A"}\n  float: ${val.float ?? "N/A"}\n  str: ${val.str ?? "N/A"}\n  set: ${val.set ?? "N/A"}`);
      }
      return ok(String(val));
    },
    async set_hypr_option(args) {
      await hyprctl("keyword", [args.option, args.value], false);
      return ok(`Set ${args.option} = ${args.value} (runtime only)`);
    },
    async get_hypr_binds() {
      const binds = await hyprctl("binds");
      if (!Array.isArray(binds)) return ok(String(binds));
      const lines = binds.map((b: any) =>
        `${b.modmask ? "SUPER+" : ""}${b.key} → ${b.dispatcher} ${b.arg}`
      );
      return ok(lines.join("\n") || "No bindings found");
    },
    async toggle_animations() {
      const opt = await hyprctl("getoption", ["animations:enabled"]);
      const current = opt?.int ?? 1;
      const next = current ? 0 : 1;
      await hyprctl("keyword", ["animations:enabled", String(next)], false);
      return ok(`Animations ${next ? "enabled" : "disabled"}`);
    },
  },
};
