#!/usr/bin/env python3
"""Send a WhatsApp message via Firefox Bridge.
Usage: wa_send.py "message" chat_name
Bridge URL: $FIREFOX_BRIDGE_URL (default http://localhost:7866)
"""
import os, sys, json, time, requests

API = os.environ.get("FIREFOX_BRIDGE_URL", "http://localhost:7866")

def find_wa_tab():
    r = requests.get(f"{API}/api/get_tabs").json()
    for t in r.get("tabs", []):
        if "whatsapp" in t.get("title", "").lower() or "whatsapp" in t.get("url", "").lower():
            return t["id"]
    return None

def js(code, tab):
    return requests.post(f"{API}/api/evaluate", json={"tabId": tab, "code": code}).json().get("result")

def send_message(msg, chat):
    tab = find_wa_tab()
    if not tab:
        print("ERROR: No WhatsApp tab found")
        return False

    # 1. Click chat from sidebar
    js(f"""(() => {{
        const spans = document.querySelectorAll('span[title]');
        for (const s of spans) {{
            if (s.title.toLowerCase().includes({json.dumps(chat.lower())})) {{
                s.dispatchEvent(new MouseEvent('mousedown', {{bubbles:true}}));
                s.dispatchEvent(new MouseEvent('click', {{bubbles:true}}));
                return 'clicked';
            }}
        }}
        return 'not found';
    }})()""", tab)
    time.sleep(1.5)

    # 2. Type message
    result = js("""(() => {
        const box = document.querySelector('#main footer [contenteditable="true"]');
        if (!box) return 'no box';
        box.focus();
        document.execCommand('insertText', false, """ + json.dumps(msg) + """);
        return 'typed';
    })()""", tab)
    if result != "typed":
        print(f"ERROR: {result}")
        return False
    time.sleep(0.3)

    # 3. Press Enter to send
    js("""(() => {
        const box = document.querySelector('#main footer [contenteditable="true"]');
        if (!box) return 'no box';
        box.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
        return 'sent';
    })()""", tab)
    return True

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: wa_send.py 'message' chat_name")
        sys.exit(1)
    msg = sys.argv[1]
    chat = sys.argv[2]
    ok = send_message(msg, chat)
    print("Sent" if ok else "Failed")
