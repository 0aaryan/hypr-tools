import { safeExec, ok, err, type ToolModule } from "../utils.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

// Projector config file — stores IP, Fully Kiosk password, dashboard URL, etc.
const CONFIG_DIR = resolve(homedir(), ".config/hypr-tools");
const CONFIG_PATH = resolve(CONFIG_DIR, "projector.json");

interface ProjectorConfig {
  ip: string;
  adb_port: number;
  fkb_port: number;
  fkb_password: string;
  dashboard_url?: string;
}

function loadConfig(): ProjectorConfig {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch {}
  }
  return { ip: "", adb_port: 5555, fkb_port: 2323, fkb_password: "" };
}

function saveConfig(config: ProjectorConfig) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function adb(args: string[], timeout = 10000): Promise<string> {
  const config = loadConfig();
  if (!config.ip) return "Error: projector IP not configured. Use projector_setup first.";
  const result = await safeExec("adb", ["-s", `${config.ip}:${config.adb_port}`, ...args], timeout);
  if (result.exitCode !== 0 && result.stderr) return `ADB error: ${result.stderr}`;
  return result.stdout;
}

async function fkb(cmd: string, params: Record<string, string> = {}): Promise<string> {
  const config = loadConfig();
  if (!config.ip) return "Error: projector IP not configured.";
  if (!config.fkb_password) return "Error: Fully Kiosk password not configured.";
  const qs = new URLSearchParams({ cmd, password: config.fkb_password, ...params }).toString();
  const url = `http://${config.ip}:${config.fkb_port}/?${qs}`;
  const result = await safeExec("curl", ["-s", "--connect-timeout", "5", url], 8000);
  return result.stdout || result.stderr || "No response";
}

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const projectorTools: ToolModule = {
  tools: [
    {
      name: "projector_setup",
      description: "Configure projector connection. Sets IP address, ADB port, Fully Kiosk Browser password and the dashboard URL. Run this first before using other projector tools.",
      inputSchema: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Projector IP address on local network" },
          adb_port: { type: "number", description: "ADB port (default: 5555)" },
          fkb_password: { type: "string", description: "Fully Kiosk Browser remote admin password" },
          fkb_port: { type: "number", description: "Fully Kiosk Browser port (default: 2323)" },
          dashboard_url: { type: "string", description: "Page that projector_show_dashboard opens" },
        },
        required: ["ip"],
      },
      annotations: WR,
    },
    {
      name: "projector_status",
      description: "Check projector connection status. Tests ADB and Fully Kiosk Browser connectivity.",
      inputSchema: { type: "object", properties: {} },
      annotations: RO,
    },
    {
      name: "projector_open_url",
      description: "Open a URL on the projector browser.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to open on the projector" },
        },
        required: ["url"],
      },
      annotations: WR,
    },
    {
      name: "projector_show_dashboard",
      description: "Open the configured dashboard URL on the projector in fullscreen.",
      inputSchema: { type: "object", properties: {} },
      annotations: WR,
    },
    {
      name: "projector_wake",
      description: "Wake up the projector screen (turn on display).",
      inputSchema: { type: "object", properties: {} },
      annotations: WR,
    },
    {
      name: "projector_sleep",
      description: "Put the projector screen to sleep (turn off display).",
      inputSchema: { type: "object", properties: {} },
      annotations: WR,
    },
    {
      name: "projector_fullscreen",
      description: "Enable fullscreen immersive mode on the projector (hide status bar and navigation).",
      inputSchema: { type: "object", properties: {} },
      annotations: WR,
    },
    {
      name: "projector_brightness",
      description: "Set the projector screen brightness (0-255).",
      inputSchema: {
        type: "object",
        properties: {
          level: { type: "number", description: "Brightness level 0-255" },
        },
        required: ["level"],
      },
      annotations: WR,
    },
    {
      name: "projector_reload",
      description: "Reload the current page on the projector browser.",
      inputSchema: { type: "object", properties: {} },
      annotations: WR,
    },
    {
      name: "projector_screenshot",
      description: "Take a screenshot of the projector screen and save it locally.",
      inputSchema: {
        type: "object",
        properties: {
          output: { type: "string", description: "Output file path (default: /tmp/projector-screenshot.png)" },
        },
      },
      annotations: RO,
    },
    {
      name: "projector_speak",
      description: "Make the projector speak text using text-to-speech.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to speak" },
        },
        required: ["text"],
      },
      annotations: WR,
    },
    {
      name: "projector_scan",
      description: "Scan the local network for Android devices that could be projectors. Uses nmap to find devices on port 5555.",
      inputSchema: { type: "object", properties: {} },
      annotations: RO,
    },
  ],

  handlers: {
    async projector_setup(args) {
      const config = loadConfig();
      if (args.ip) config.ip = args.ip;
      if (args.adb_port) config.adb_port = args.adb_port;
      if (args.fkb_password) config.fkb_password = args.fkb_password;
      if (args.fkb_port) config.fkb_port = args.fkb_port;
      if (args.dashboard_url) config.dashboard_url = args.dashboard_url;
      saveConfig(config);

      // Try ADB connect
      const result = await safeExec("adb", ["connect", `${config.ip}:${config.adb_port}`], 10000);
      return ok(`Projector configured:\n  IP: ${config.ip}\n  ADB: ${config.adb_port}\n  FKB: ${config.fkb_port}\n\nADB connect: ${result.stdout || result.stderr}`);
    },

    async projector_status() {
      const config = loadConfig();
      if (!config.ip) return err("Projector not configured. Run projector_setup first.");

      const lines: string[] = [`Config: IP=${config.ip}, ADB=${config.adb_port}, FKB=${config.fkb_port}`];

      // Test ADB
      const adbResult = await safeExec("adb", ["devices"], 5000);
      const connected = adbResult.stdout.includes(config.ip);
      lines.push(`ADB: ${connected ? "connected" : "not connected"}`);

      // Test Fully Kiosk
      if (config.fkb_password) {
        const fkbResult = await fkb("getDeviceInfo");
        const fkbOk = fkbResult.includes("deviceName") || fkbResult.includes("deviceModel");
        lines.push(`Fully Kiosk: ${fkbOk ? "responding" : "not responding"}`);
        if (fkbOk) {
          try {
            const info = JSON.parse(fkbResult);
            lines.push(`  Model: ${info.deviceModel || "unknown"}`);
            lines.push(`  Battery: ${info.batteryLevel || "unknown"}%`);
            lines.push(`  Current URL: ${info.currentTabUrl || "none"}`);
          } catch {}
        }
      } else {
        lines.push("Fully Kiosk: password not configured");
      }

      return ok(lines.join("\n"));
    },

    async projector_open_url(args) {
      const config = loadConfig();
      // Try Fully Kiosk first, fall back to ADB
      if (config.fkb_password) {
        const result = await fkb("loadUrl", { url: args.url });
        return ok(`Opened on projector (FKB): ${args.url}\nResponse: ${result.substring(0, 200)}`);
      }
      const result = await adb(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", args.url]);
      return ok(`Opened on projector (ADB): ${args.url}\n${result}`);
    },

    async projector_show_dashboard() {
      const config = loadConfig();
      const DASHBOARD_URL = config.dashboard_url;
      if (!DASHBOARD_URL) return err("No dashboard URL configured. Set dashboard_url with projector_setup.");
      if (config.fkb_password) {
        await fkb("loadUrl", { url: DASHBOARD_URL });
        return ok(`Dashboard loaded on projector: ${DASHBOARD_URL}`);
      }
      await adb(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", DASHBOARD_URL]);
      return ok(`Dashboard opened on projector: ${DASHBOARD_URL}`);
    },

    async projector_wake() {
      const config = loadConfig();
      if (config.fkb_password) {
        await fkb("screenOn");
        return ok("Projector screen turned on (FKB)");
      }
      await adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
      return ok("Projector wake signal sent (ADB)");
    },

    async projector_sleep() {
      const config = loadConfig();
      if (config.fkb_password) {
        await fkb("screenOff");
        return ok("Projector screen turned off (FKB)");
      }
      await adb(["shell", "input", "keyevent", "KEYCODE_SLEEP"]);
      return ok("Projector sleep signal sent (ADB)");
    },

    async projector_fullscreen() {
      await adb(["shell", "settings", "put", "global", "policy_control", "immersive.full=*"]);
      return ok("Fullscreen immersive mode enabled on projector");
    },

    async projector_brightness(args) {
      const level = Math.max(0, Math.min(255, args.level));
      const config = loadConfig();
      if (config.fkb_password) {
        await fkb("setScreenBrightness", { level: String(level) });
        return ok(`Projector brightness set to ${level}/255 (FKB)`);
      }
      await adb(["shell", "settings", "put", "system", "screen_brightness", String(level)]);
      return ok(`Projector brightness set to ${level}/255 (ADB)`);
    },

    async projector_reload() {
      const config = loadConfig();
      if (config.fkb_password) {
        await fkb("loadCurrentUrl");
        return ok("Projector page reloaded (FKB)");
      }
      return err("Reload requires Fully Kiosk Browser. Configure fkb_password with projector_setup.");
    },

    async projector_screenshot(args) {
      const output = args.output || "/tmp/projector-screenshot.png";
      await adb(["shell", "screencap", "-p", "/sdcard/screenshot.png"]);
      await adb(["pull", "/sdcard/screenshot.png", output]);
      await adb(["shell", "rm", "/sdcard/screenshot.png"]);
      return ok(`Screenshot saved to ${output}`);
    },

    async projector_speak(args) {
      const config = loadConfig();
      if (config.fkb_password) {
        await fkb("textToSpeech", { text: args.text });
        return ok(`Projector speaking: "${args.text}"`);
      }
      return err("TTS requires Fully Kiosk Browser. Configure fkb_password with projector_setup.");
    },

    async projector_scan() {
      // Scan the local subnet(s) for Android devices
      const routes = await safeExec("ip", ["-4", "route", "show", "scope", "link"]);
      const subnets = routes.stdout.split("\n").map((l) => l.split(" ")[0]).filter((s) => s.includes("/"));
      if (!subnets.length) return err("Could not determine the local subnet.");
      const result = await safeExec("nmap", ["-sn", "-T5", ...subnets], 30000);
      const lines = result.stdout.split("\n");
      const devices: string[] = [];
      let current = "";
      for (const line of lines) {
        if (line.includes("Nmap scan report")) current = line;
        if (line.includes("Host is up") && current) {
          devices.push(current.replace("Nmap scan report for ", ""));
          current = "";
        }
      }

      // Also try ADB devices
      const adbDevices = await safeExec("adb", ["devices"], 5000);

      return ok(`Network scan found ${devices.length} devices:\n${devices.join("\n")}\n\nADB devices:\n${adbDevices.stdout}`);
    },
  },
};
