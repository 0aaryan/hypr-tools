import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const colorPickerTools: ToolModule = {
  tools: [
    {
      name: "pick_color",
      description: "Open an on-screen color picker and return the selected hex color",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "pick_color_to_clipboard",
      description: "Pick a color from the screen and copy the hex value to clipboard",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async pick_color() {
      const r = await safeExec("hyprpicker", ["-n"], 30000);
      return r.exitCode === 0 ? ok(`Color: ${r.stdout}`) : err("Color pick cancelled or failed");
    },
    async pick_color_to_clipboard() {
      const r = await safeExec("hyprpicker", ["-a"], 30000);
      return r.exitCode === 0 ? ok(`Color copied to clipboard: ${r.stdout}`) : err("Color pick cancelled or failed");
    },
  },
};
