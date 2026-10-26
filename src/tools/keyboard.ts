import { safeExec, hyprctl, ok, err, scriptPath, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const keyboardTools: ToolModule = {
  tools: [
    {
      name: "get_keyboard_layout",
      description: "Get the current keyboard layout",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "switch_keyboard_layout",
      description: "Cycle to the next keyboard layout",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "start_reading_mode",
      description: "Start key remapping for reading mode (evremap)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "stop_reading_mode",
      description: "Stop key remapping for reading mode",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async get_keyboard_layout() {
      const devices = await hyprctl("devices");
      if (devices?.keyboards) {
        const kbs = devices.keyboards.map((k: any) => `${k.name}: ${k.active_keymap}`);
        return ok(kbs.join("\n"));
      }
      return err("Could not get keyboard info");
    },
    async switch_keyboard_layout() {
      const devices = await hyprctl("devices");
      const kb = devices?.keyboards?.[0]?.name;
      if (!kb) return err("No keyboard found");
      await hyprctl("switchxkblayout", [kb, "next"], false);
      return ok("Keyboard layout switched");
    },
    async start_reading_mode() {
      const r = await safeExec(scriptPath("start_reading_mode.sh"), [], 10000);
      return ok("Reading mode started");
    },
    async stop_reading_mode() {
      const r = await safeExec(scriptPath("stop_reading_mode.sh"), [], 10000);
      return ok("Reading mode stopped");
    },
  },
};
