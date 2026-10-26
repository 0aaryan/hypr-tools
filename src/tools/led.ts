import { safeExec, ok, err, type ToolModule } from "../utils.js";
import { resolve } from "node:path";

// Python scripts live in src/tools/ — dirname is build/tools/ at runtime, go up to find src
const SRC_TOOLS = resolve(import.meta.dirname, "../../src/tools");
const LED_SCRIPT = resolve(SRC_TOOLS, "led_strip.py");
const TIMEOUT = 20000; // BLE can be slow

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

async function led(cmd: string, args?: Record<string, any>): Promise<string> {
  const cmdArgs = [LED_SCRIPT, cmd];
  if (args) cmdArgs.push(JSON.stringify(args));
  const r = await safeExec("python3", cmdArgs, TIMEOUT);
  return r.stdout || r.stderr;
}

export const ledTools: ToolModule = {
  tools: [
    {
      name: "led_set_color",
      description:
        "Set LED strip to a specific RGB color (0-255 each) or a named color (red, green, blue, white, purple, cyan, yellow, orange, pink, warm, magenta)",
      inputSchema: {
        type: "object",
        properties: {
          r: { type: "number", description: "Red (0-255)" },
          g: { type: "number", description: "Green (0-255)" },
          b: { type: "number", description: "Blue (0-255)" },
          name: {
            type: "string",
            description:
              "Named color instead of RGB: red, green, blue, white, purple, cyan, yellow, orange, pink, warm, magenta",
          },
        },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "led_set_brightness",
      description: "Set LED strip brightness (0-100%)",
      inputSchema: {
        type: "object",
        properties: {
          level: { type: "number", description: "Brightness percentage (0-100)" },
        },
        required: ["level"],
      },
      annotations: WR,
    },
    {
      name: "led_power",
      description: "Turn LED strip on or off",
      inputSchema: {
        type: "object",
        properties: {
          on: { type: "boolean", description: "true = on, false = off" },
        },
        required: ["on"],
      },
      annotations: WR,
    },
    {
      name: "led_set_pattern",
      description:
        "Set LED strip to a built-in animation pattern by index (0-210) or name. Examples: rainbow, strobe, wave, breathing, etc.",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "number", description: "Pattern index (0-210)" },
          name: {
            type: "string",
            description:
              "Pattern name (e.g. fwd_dreaming, strobe_7c, gradual_7c, hop_rgb)",
          },
        },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "led_effect",
      description:
        "Run a LED animation effect: rainbow (color cycle), pulse (brightness breathing), or wave (smooth color transition)",
      inputSchema: {
        type: "object",
        properties: {
          effect: {
            type: "string",
            enum: ["rainbow", "pulse", "wave"],
            description: "Effect to run",
          },
          loops: { type: "number", description: "Number of loops (default 3)" },
        },
        required: ["effect"],
      },
      annotations: WR,
    },
    {
      name: "led_scan",
      description: "Scan for BLE LED strips nearby",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
  ],

  handlers: {
    async led_set_color(args) {
      if (args.name) {
        const out = await led(args.name);
        return out.startsWith("OK") ? ok(`LED color: ${args.name}`) : err(out);
      }
      const r = args.r ?? 255,
        g = args.g ?? 0,
        b = args.b ?? 0;
      const out = await led("color", { r, g, b });
      return out.startsWith("OK")
        ? ok(`LED color set to RGB(${r}, ${g}, ${b})`)
        : err(out);
    },

    async led_set_brightness(args) {
      const level = Math.max(0, Math.min(100, args.level));
      const out = await led("brightness", { level });
      return out.startsWith("OK")
        ? ok(`LED brightness: ${level}%`)
        : err(out);
    },

    async led_power(args) {
      const out = await led(args.on ? "on" : "off");
      return out.startsWith("OK")
        ? ok(`LED strip ${args.on ? "ON" : "OFF"}`)
        : err(out);
    },

    async led_set_pattern(args) {
      if (args.name) {
        // Search for pattern by name — use the pattern command with index lookup
        const r = await safeExec(
          "python3",
          [
            "-c",
            `
import sys; sys.path.insert(0, "${resolve(SRC_TOOLS)}")
from led_strip import PATTERNS
name = ${JSON.stringify(args.name)}.lower()
matches = [(i, p) for i, p in enumerate(PATTERNS) if name in p.lower()]
if matches:
    print(matches[0][0])
else:
    print("NOT_FOUND")
`,
          ],
          5000
        );
        if (r.stdout === "NOT_FOUND") {
          return err(`Pattern "${args.name}" not found`);
        }
        const idx = parseInt(r.stdout);
        const out = await led("pattern", { index: idx });
        return out.startsWith("OK")
          ? ok(`LED pattern: ${args.name} (index ${idx})`)
          : err(out);
      }
      const idx = args.index ?? 1;
      const out = await led("pattern", { index: idx });
      return out.startsWith("OK")
        ? ok(`LED pattern set to index ${idx}`)
        : err(out);
    },

    async led_effect(args) {
      const loops = args.loops ?? 3;
      const cmdArgs = [LED_SCRIPT, args.effect, String(loops)];
      const r = await safeExec("python3", cmdArgs, 60000);
      return ok(r.stdout || `${args.effect} effect complete`);
    },

    async led_scan() {
      const r = await safeExec("python3", [LED_SCRIPT, "scan"], 15000);
      return ok(r.stdout || "No LED strips found");
    },
  },
};
