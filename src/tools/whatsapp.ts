import { safeExec, ok, err, type ToolModule } from "../utils.js";
import { resolve } from "node:path";

const SRC_TOOLS = resolve(import.meta.dirname, "../../src/tools");
const WA_SCRIPT = resolve(SRC_TOOLS, "wa_send.py");

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const whatsappTools: ToolModule = {
  tools: [
    {
      name: "wa_send_message",
      description:
        "Send a WhatsApp message via Firefox Bridge. Requires Firefox with WhatsApp Web open and the bridge extension active.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Message text to send" },
          chat: {
            type: "string",
            description:
              "Chat name to send to (substring match)",
          },
        },
        required: ["message", "chat"],
      },
      annotations: WR,
    },
    {
      name: "wa_list_chats",
      description:
        "List visible WhatsApp chat names from the sidebar via Firefox Bridge",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "wa_read_messages",
      description:
        "Read the last N messages from a WhatsApp chat via Firefox Bridge",
      inputSchema: {
        type: "object",
        properties: {
          chat: {
            type: "string",
            description: "Chat name to read from (substring match)",
          },
          count: {
            type: "number",
            description: "Number of recent messages to read (default 10)",
          },
        },
        required: ["chat"],
      },
      annotations: RO,
    },
  ],

  handlers: {
    async wa_send_message(args) {
      const chat = args.chat;
      const r = await safeExec(
        "python3",
        [WA_SCRIPT, args.message, chat],
        15000
      );
      if (r.stdout.includes("Sent")) {
        return ok(`Message sent to "${chat}"`);
      }
      return err(`Failed to send: ${r.stdout} ${r.stderr}`);
    },

    async wa_list_chats() {
      // Use Firefox Bridge API to list chats from WhatsApp sidebar
      const r = await safeExec(
        "python3",
        [
          "-c",
          `
import os, requests, json
API = os.environ.get("FIREFOX_BRIDGE_URL", "http://localhost:7866")
tabs = requests.get(f"{API}/api/get_tabs", timeout=5).json().get("tabs", [])
tab = next((t["id"] for t in tabs if "whatsapp" in t.get("title","").lower() or "whatsapp" in t.get("url","").lower()), None)
if not tab:
    print("ERROR: No WhatsApp tab")
else:
    r = requests.post(f"{API}/api/evaluate", json={"tabId": tab, "code": """
        (() => {
            const items = document.querySelectorAll('[data-testid="cell-frame-container"] span[title]');
            return Array.from(items).map(s => s.title).filter(t => t && t.length > 0).slice(0, 30).join('\\n');
        })()
    """}, timeout=10).json()
    print(r.get("result", "No chats found"))
`,
        ],
        15000
      );
      if (r.stdout.startsWith("ERROR")) return err(r.stdout);
      return ok(r.stdout || "No chats found");
    },

    async wa_read_messages(args) {
      const count = args.count ?? 10;
      const r = await safeExec(
        "python3",
        [
          "-c",
          `
import os, requests, json, time, sys
API = os.environ.get("FIREFOX_BRIDGE_URL", "http://localhost:7866")
chat = ${JSON.stringify(args.chat)}
count = ${count}

tabs = requests.get(f"{API}/api/get_tabs", timeout=5).json().get("tabs", [])
tab = next((t["id"] for t in tabs if "whatsapp" in t.get("title","").lower() or "whatsapp" in t.get("url","").lower()), None)
if not tab:
    print("ERROR: No WhatsApp tab"); sys.exit()

# Click chat
requests.post(f"{API}/api/evaluate", json={"tabId": tab, "code": f"""(() => {{
    const spans = document.querySelectorAll('span[title]');
    for (const s of spans) {{
        if (s.title.toLowerCase().includes({json.dumps(chat.lower())})) {{
            s.dispatchEvent(new MouseEvent('mousedown', {{bubbles:true}}));
            s.dispatchEvent(new MouseEvent('click', {{bubbles:true}}));
            return 'clicked';
        }}
    }}
    return 'not found';
}})()"""}, timeout=10)
time.sleep(1.5)

# Read messages
r = requests.post(f"{API}/api/evaluate", json={"tabId": tab, "code": f"""(() => {{
    const rows = document.querySelectorAll('[data-testid="msg-container"]');
    const msgs = [];
    const items = Array.from(rows).slice(-{count});
    for (const row of items) {{
        const txt = row.querySelector('[data-testid="msg-text"]');
        const meta = row.querySelector('[data-testid="msg-meta"]');
        const isOut = row.closest('[data-testid="conversation-panel-body"]')
                        ?.querySelector('.message-out') !== null
                     || row.classList.contains('message-out')
                     || !!row.querySelector('[data-testid="msg-dblcheck"]');
        const time = meta ? meta.textContent.trim() : '';
        const text = txt ? txt.textContent.trim() : '(media/sticker)';
        msgs.push((isOut ? 'You' : '{chat}') + ' [' + time + ']: ' + text);
    }}
    return msgs.join('\\n');
}})()"""}, timeout=10).json()
print(r.get("result", "No messages"))
`,
        ],
        20000
      );
      if (r.stdout.startsWith("ERROR")) return err(r.stdout);
      return ok(r.stdout || "No messages found");
    },
  },
};
