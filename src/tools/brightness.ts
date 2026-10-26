import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const brightnessTools: ToolModule = {
  tools: [
    {
      name: "get_brightness",
      description: "Get current screen brightness as a percentage",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_brightness",
      description: "Set screen brightness to a specific percentage (1-100)",
      inputSchema: {
        type: "object",
        properties: { percent: { type: "number", description: "Brightness percentage (1-100)" } },
        required: ["percent"],
      },
      annotations: WR,
    },
    {
      name: "increase_brightness",
      description: "Increase screen brightness by N percent (default 5)",
      inputSchema: {
        type: "object",
        properties: { step: { type: "number", description: "Percentage to increase (default 5)" } },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "decrease_brightness",
      description: "Decrease screen brightness by N percent (default 5)",
      inputSchema: {
        type: "object",
        properties: { step: { type: "number", description: "Percentage to decrease (default 5)" } },
        required: [],
      },
      annotations: WR,
    },
  ],

  handlers: {
    async get_brightness() {
      const r = await safeExec("brightnessctl", ["info"]);
      const match = r.stdout.match(/\((\d+)%\)/);
      return ok(match ? `Brightness: ${match[1]}%` : r.stdout);
    },
    async set_brightness(args) {
      const p = Math.max(1, Math.min(100, args.percent));
      await safeExec("brightnessctl", ["set", `${p}%`]);
      return ok(`Brightness set to ${p}%`);
    },
    async increase_brightness(args) {
      const step = args.step ?? 5;
      await safeExec("brightnessctl", ["set", `+${step}%`]);
      const r = await safeExec("brightnessctl", ["info"]);
      const match = r.stdout.match(/\((\d+)%\)/);
      return ok(`Brightness increased by ${step}% → now ${match?.[1] ?? "?"}%`);
    },
    async decrease_brightness(args) {
      const step = args.step ?? 5;
      await safeExec("brightnessctl", ["set", `${step}%-`]);
      const r = await safeExec("brightnessctl", ["info"]);
      const match = r.stdout.match(/\((\d+)%\)/);
      return ok(`Brightness decreased by ${step}% → now ${match?.[1] ?? "?"}%`);
    },
  },
};
