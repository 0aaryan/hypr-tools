import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DES = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

export const clipboardTools: ToolModule = {
  tools: [
    {
      name: "get_clipboard",
      description: "Get current clipboard text content",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_clipboard",
      description: "Copy text to the clipboard",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "Text to copy to clipboard" } },
        required: ["text"],
      },
      annotations: WR,
    },
    {
      name: "list_clipboard_history",
      description: "List recent clipboard history entries",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number", description: "Max entries to return (default 20)" } },
        required: [],
      },
      annotations: RO,
    },
    {
      name: "paste_from_history",
      description: "Copy a specific clipboard history entry to the active clipboard by its ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Cliphist entry ID" } },
        required: ["id"],
      },
      annotations: WR,
    },
    {
      name: "delete_clipboard_entry",
      description: "Delete a specific entry from clipboard history by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Cliphist entry ID to delete" } },
        required: ["id"],
      },
      annotations: DES,
    },
    {
      name: "clear_clipboard_history",
      description: "Wipe the entire clipboard history",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: DES,
    },
  ],

  handlers: {
    async get_clipboard() {
      const r = await safeExec("wl-paste", []);
      return ok(r.stdout || "(clipboard empty)");
    },
    async set_clipboard(args) {
      const r = await safeExec("wl-copy", [args.text]);
      return ok(`Copied to clipboard: ${args.text.slice(0, 100)}${args.text.length > 100 ? "..." : ""}`);
    },
    async list_clipboard_history(args) {
      const limit = args.limit ?? 20;
      const r = await safeExec("cliphist", ["list"]);
      const lines = r.stdout.split("\n").slice(0, limit);
      return ok(lines.join("\n") || "No clipboard history");
    },
    async paste_from_history(args) {
      const r = await safeExec("cliphist", ["decode", args.id]);
      if (r.stdout) {
        await safeExec("wl-copy", [r.stdout]);
        return ok(`Pasted from history: ${r.stdout.slice(0, 100)}`);
      }
      return err("Entry not found");
    },
    async delete_clipboard_entry(args) {
      await safeExec("cliphist", ["delete", args.id]);
      return ok(`Deleted clipboard entry: ${args.id}`);
    },
    async clear_clipboard_history() {
      await safeExec("cliphist", ["wipe"]);
      return ok("Clipboard history cleared");
    },
  },
};
