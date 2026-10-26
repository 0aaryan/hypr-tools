import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const powerTools: ToolModule = {
  tools: [
    {
      name: "get_power_profile",
      description:
        "Get the current power profile (performance, balanced, power-saver)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_power_profile",
      description: "Set the power profile",
      inputSchema: {
        type: "object",
        properties: {
          profile: {
            type: "string",
            enum: ["performance", "balanced", "power-saver"],
            description: "Power profile to set",
          },
        },
        required: ["profile"],
      },
      annotations: WR,
    },
    {
      name: "get_screen_timeout",
      description: "Get the current screen idle timeout and lock timeout",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_thermal_info",
      description: "Get CPU and GPU temperatures",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
  ],

  handlers: {
    async get_power_profile() {
      const r = await safeExec("powerprofilesctl", ["get"]);
      if (r.exitCode !== 0) {
        // Fallback: try tlp
        const tlp = await safeExec("bash", [
          "-c",
          "cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo unknown",
        ]);
        return ok(`CPU governor: ${tlp.stdout}`);
      }
      return ok(`Power profile: ${r.stdout}`);
    },

    async set_power_profile(args) {
      const r = await safeExec("powerprofilesctl", ["set", args.profile]);
      if (r.exitCode !== 0) {
        return err(
          `Failed to set profile: ${r.stderr}. Is power-profiles-daemon installed?`
        );
      }
      return ok(`Power profile set to: ${args.profile}`);
    },

    async get_screen_timeout() {
      // Check hypridle config
      const r = await safeExec("bash", [
        "-c",
        `grep -E 'timeout|on-timeout|on-resume' ~/.config/hypr/hypridle.conf 2>/dev/null || echo "No hypridle config found"`,
      ]);
      return ok(r.stdout);
    },

    async get_thermal_info() {
      const [cpu, gpu] = await Promise.all([
        safeExec("bash", [
          "-c",
          `sensors 2>/dev/null | grep -E '(Core|Tctl|CPU|Package)' | head -5`,
        ]),
        safeExec("bash", [
          "-c",
          `nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>/dev/null || echo "N/A"`,
        ]),
      ]);
      return ok(`CPU Temps:\n${cpu.stdout || "N/A"}\n\nGPU Temp: ${gpu.stdout}°C`);
    },
  },
};
