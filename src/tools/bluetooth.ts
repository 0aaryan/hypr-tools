import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

async function btctl(args: string[]): Promise<string> {
  const r = await safeExec("bluetoothctl", args, 10000);
  return r.stdout;
}

export const bluetoothTools: ToolModule = {
  tools: [
    {
      name: "get_bluetooth_status",
      description: "Get bluetooth power state and currently connected devices",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "list_bluetooth_devices",
      description: "List paired and nearby bluetooth devices",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "connect_bluetooth",
      description: "Connect to a paired bluetooth device by MAC address or name",
      inputSchema: {
        type: "object",
        properties: { device: { type: "string", description: "MAC address (e.g. AA:BB:CC:DD:EE:FF)" } },
        required: ["device"],
      },
      annotations: WR,
    },
    {
      name: "disconnect_bluetooth",
      description: "Disconnect a bluetooth device by MAC address",
      inputSchema: {
        type: "object",
        properties: { device: { type: "string", description: "MAC address of the device" } },
        required: ["device"],
      },
      annotations: WR,
    },
    {
      name: "toggle_bluetooth",
      description: "Toggle bluetooth power on or off",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async get_bluetooth_status() {
      const show = await btctl(["show"]);
      const powered = show.includes("Powered: yes") ? "on" : "off";
      const connected = await btctl(["devices", "Connected"]);
      return ok(`Bluetooth: ${powered}\nConnected devices:\n${connected || "(none)"}`);
    },
    async list_bluetooth_devices() {
      const paired = await btctl(["devices", "Paired"]);
      const all = await btctl(["devices"]);
      return ok(`Paired devices:\n${paired || "(none)"}\n\nAll known devices:\n${all || "(none)"}`);
    },
    async connect_bluetooth(args) {
      const r = await safeExec("bluetoothctl", ["connect", args.device], 15000);
      return r.stdout.includes("successful") ? ok(`Connected to ${args.device}`) : err(`Failed: ${r.stdout}`);
    },
    async disconnect_bluetooth(args) {
      const r = await safeExec("bluetoothctl", ["disconnect", args.device], 10000);
      return ok(`Disconnected from ${args.device}`);
    },
    async toggle_bluetooth() {
      const show = await btctl(["show"]);
      const powered = show.includes("Powered: yes");
      await btctl(["power", powered ? "off" : "on"]);
      return ok(`Bluetooth turned ${powered ? "off" : "on"}`);
    },
  },
};
