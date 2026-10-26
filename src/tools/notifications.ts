import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const notificationTools: ToolModule = {
  tools: [
    {
      name: "send_notification",
      description: "Send a desktop notification with title, body, and optional urgency/icon",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Notification title" },
          body: { type: "string", description: "Notification body text" },
          urgency: { type: "string", enum: ["low", "normal", "critical"], description: "Urgency level (default normal)" },
          icon: { type: "string", description: "Icon name or path (optional)" },
        },
        required: ["title"],
      },
      annotations: WR,
    },
    {
      name: "list_notification_history",
      description: "Get recent notification history from dunst",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number", description: "Max entries (default 20)" } },
        required: [],
      },
      annotations: RO,
    },
    {
      name: "close_all_notifications",
      description: "Dismiss all currently visible notifications",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "toggle_dnd",
      description: "Toggle Do Not Disturb mode for notifications",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "get_dnd_status",
      description: "Check if Do Not Disturb mode is enabled",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_notification_paused",
      description: "Pause or unpause notification display",
      inputSchema: {
        type: "object",
        properties: { paused: { type: "boolean", description: "true to pause, false to unpause" } },
        required: ["paused"],
      },
      annotations: WR,
    },
  ],

  handlers: {
    async send_notification(args) {
      const cmdArgs = [args.title];
      if (args.body) cmdArgs.push(args.body);
      if (args.urgency) cmdArgs.push("-u", args.urgency);
      if (args.icon) cmdArgs.push("-i", args.icon);
      await safeExec("notify-send", cmdArgs);
      return ok(`Notification sent: ${args.title}`);
    },
    async list_notification_history(args) {
      const r = await safeExec("dunstctl", ["history"]);
      try {
        const hist = JSON.parse(r.stdout);
        const entries = (hist.data?.[0] ?? []).slice(0, args.limit ?? 20);
        const formatted = entries.map((e: any) =>
          `[${e.appname?.data ?? "?"}] ${e.summary?.data ?? ""}: ${e.body?.data ?? ""}`
        );
        return ok(formatted.join("\n") || "No notification history");
      } catch {
        return ok(r.stdout || "No notification history");
      }
    },
    async close_all_notifications() {
      await safeExec("dunstctl", ["close-all"]);
      return ok("All notifications dismissed");
    },
    async toggle_dnd() {
      await safeExec("dunstctl", ["set-paused", "toggle"]);
      const r = await safeExec("dunstctl", ["is-paused"]);
      return ok(`DND ${r.stdout === "true" ? "enabled" : "disabled"}`);
    },
    async get_dnd_status() {
      const r = await safeExec("dunstctl", ["is-paused"]);
      return ok(`Do Not Disturb: ${r.stdout === "true" ? "enabled" : "disabled"}`);
    },
    async set_notification_paused(args) {
      await safeExec("dunstctl", ["set-paused", String(args.paused)]);
      return ok(`Notifications ${args.paused ? "paused" : "resumed"}`);
    },
  },
};
