import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const networkTools: ToolModule = {
  tools: [
    {
      name: "get_network_status",
      description: "Get current network connection status (WiFi SSID, IP, signal strength, device type)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "list_wifi_networks",
      description: "Scan and list available WiFi networks with signal strength",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "connect_wifi",
      description: "Connect to a WiFi network by SSID",
      inputSchema: {
        type: "object",
        properties: {
          ssid: { type: "string", description: "WiFi network SSID" },
          password: { type: "string", description: "WiFi password (optional for open/saved networks)" },
        },
        required: ["ssid"],
      },
      annotations: WR,
    },
    {
      name: "disconnect_wifi",
      description: "Disconnect from the current WiFi network",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "toggle_wifi",
      description: "Toggle WiFi radio on or off",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "get_ip_addresses",
      description: "Get all network interface IP addresses",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
  ],

  handlers: {
    async get_network_status() {
      const r = await safeExec("nmcli", ["-t", "-f", "NAME,TYPE,DEVICE,STATE", "connection", "show", "--active"]);
      const wifi = await safeExec("nmcli", ["-t", "-f", "active,ssid,signal,security", "device", "wifi", "list"]);
      const active = wifi.stdout.split("\n").find(l => l.startsWith("yes:"));
      let wifiInfo = "";
      if (active) {
        const [, ssid, signal, security] = active.split(":");
        wifiInfo = `\nWiFi: ${ssid} (signal: ${signal}%, security: ${security})`;
      }
      return ok(`Active connections:\n${r.stdout}${wifiInfo}`);
    },
    async list_wifi_networks() {
      const r = await safeExec("nmcli", ["-f", "SSID,SIGNAL,SECURITY,BARS", "device", "wifi", "list", "--rescan", "yes"], 15000);
      return ok(r.stdout || "No WiFi networks found");
    },
    async connect_wifi(args) {
      const cmdArgs = ["device", "wifi", "connect", args.ssid];
      if (args.password) cmdArgs.push("password", args.password);
      const r = await safeExec("nmcli", cmdArgs, 30000);
      return r.exitCode === 0 ? ok(`Connected to ${args.ssid}`) : err(`Failed: ${r.stderr || r.stdout}`);
    },
    async disconnect_wifi() {
      const dev = await safeExec("nmcli", ["-t", "-f", "DEVICE,TYPE", "device", "status"]);
      const wifiDev = dev.stdout.split("\n").find(l => l.includes("wifi"))?.split(":")[0];
      if (!wifiDev) return err("No WiFi device found");
      await safeExec("nmcli", ["device", "disconnect", wifiDev]);
      return ok("WiFi disconnected");
    },
    async toggle_wifi() {
      const r = await safeExec("nmcli", ["radio", "wifi"]);
      const newState = r.stdout.trim() === "enabled" ? "off" : "on";
      await safeExec("nmcli", ["radio", "wifi", newState]);
      return ok(`WiFi turned ${newState}`);
    },
    async get_ip_addresses() {
      const r = await safeExec("nmcli", ["-f", "DEVICE,IP4.ADDRESS,IP6.ADDRESS", "device", "show"]);
      return ok(r.stdout || "No IP addresses");
    },
  },
};
