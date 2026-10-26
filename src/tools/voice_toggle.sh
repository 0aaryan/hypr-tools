#!/usr/bin/env bash
# Voice toggle: press to start streaming transcription, press again to stop.
# Double-buffered: records chunk N+1 while transcribing chunk N (zero gap).

set -euo pipefail

PID_FILE="/tmp/voice-recording.pid"
SOCK="/tmp/voice-stt.sock"
KITTY_SOCK="unix:$(ls /tmp/kitty-socket-* 2>/dev/null | head -1)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
VENV="${HYPR_TOOLS_VENV:-$REPO_DIR/voice-venv}"
VENV_PYTHON="$VENV/bin/python3"

LOCK="/tmp/voice-toggle.lock"
notify() {
    notify-send -a "Voice" -r 9999 -t "${2:-3000}" "$1" 2>/dev/null || true
}

# Prevent double-firing from rapid keybind presses
exec 200>"$LOCK"
flock -n 200 || exit 0

stop_all() {
    # Kill ALL streaming python processes and parecords
    rm -f "$PID_FILE"
    pkill -f "pw-record.*voice-chunk" 2>/dev/null || true
    # Kill the streaming python (matches "python3 - /tmp/voice-stt.sock")
    pkill -f "python3 - /tmp/voice-stt.sock" 2>/dev/null || true
    rm -f /tmp/voice-chunk-*.wav 2>/dev/null || true
}

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    stop_all
    notify "Stopped"
else
    # Clean any stale state first
    stop_all

    pkill -f "ffplay.*pipe" 2>/dev/null || true
    pkill -f "edge_tts" 2>/dev/null || true

    if [[ ! -S "$SOCK" ]]; then
        notify "STT daemon not running! Super+Shift+I first."
        exit 1
    fi

    notify "Listening..." 30000

    "$VENV_PYTHON" - "$SOCK" "$KITTY_SOCK" <<'PYEOF' &
import socket, json, os, sys, subprocess, signal, time

SOCK_PATH = sys.argv[1]
KITTY_SOCK = sys.argv[2]
CHUNK_SECS = 1.5
TARGET_FILE = "/tmp/voice-target"
# Sci-fi trigger words — unique enough to never appear in normal speech.
# Say any of these as the LAST word to press Enter (submit the message).
# Two tiers: single-word triggers and two-word "spell" triggers.
SINGLE_TRIGGERS = {
    "execute",      # Star Trek — "execute the command"
    "transmit",     # radio/military — "transmit message"
    "dispatch",     # formal — "dispatch it"
    "commence",     # formal — "commence operation"
    "initiate",     # sci-fi — "initiate sequence"
    "terminate",    # Terminator — "terminate process"
    "override",     # sci-fi — "override controls"
    "disengage",    # Star Trek — "disengage"
    "affirmative",  # military — "affirmative"
    "deploy",       # devops — "deploy changes"
}
# Two-word combos (last TWO words) — even more unique, zero false positives
SPELL_TRIGGERS = {
    ("make", "it", "so"),       # Picard
    ("end", "transmission"),    # radio signoff
    ("fire", "away"),           # launch command
    ("lock", "on"),             # weapons lock
    ("beam", "up"),             # Star Trek transporter
    ("warp", "speed"),          # Star Trek
    ("green", "light"),         # mission go
    ("all", "systems", "go"),   # NASA
}

running = True
has_typed = False
cur_rec = None

def cleanup_and_exit(*_):
    global running, cur_rec
    running = False
    if cur_rec and cur_rec.poll() is None:
        cur_rec.kill()
signal.signal(signal.SIGTERM, cleanup_and_exit)
signal.signal(signal.SIGINT, cleanup_and_exit)

def transcribe_fast(path):
    if not os.path.isfile(path) or os.path.getsize(path) < 500:
        return ""
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(10)
    try:
        sock.connect(SOCK_PATH)
        sock.sendall(json.dumps({"audio_path": path, "model": "small", "beam_size": 1}).encode())
        sock.shutdown(socket.SHUT_WR)
        data = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
        sock.close()
        return json.loads(data).get("text", "")
    except:
        return ""

def type_text(text):
    if not text:
        return
    if os.path.isfile(TARGET_FILE):
        match = open(TARGET_FILE).read().strip()
        subprocess.run(["kitty", "@", "--to", KITTY_SOCK,
                       "send-text", "--match", f"title:{match}", "--", text],
                      capture_output=True)
    else:
        subprocess.run(["wtype", "--", text], capture_output=True)

def press_enter():
    if os.path.isfile(TARGET_FILE):
        match = open(TARGET_FILE).read().strip()
        subprocess.run(["kitty", "@", "--to", KITTY_SOCK,
                       "send-text", "--match", f"title:{match}", "--", "\r"],
                      capture_output=True)
    else:
        subprocess.run(["wtype", "-k", "Return"], capture_output=True)

def start_rec(idx):
    f = f"/tmp/voice-chunk-{idx}.wav"
    p = subprocess.Popen(
        ["pw-record", "--format=s16", "--rate=16000",
         "--channels=1", f],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    return f, p

def stop_rec(proc):
    proc.terminate()
    try:
        proc.wait(timeout=1)
    except:
        proc.kill()
    time.sleep(0.02)

def strip_punct(w):
    return w.lower().rstrip(".,!?;:")

def check_trigger(words):
    """Check if words end with a trigger. Returns (trigger_len, matched) or (0, False)."""
    lw = [strip_punct(w) for w in words]
    # Check single-word triggers (last word)
    if lw and lw[-1] in SINGLE_TRIGGERS:
        return 1, True
    # Check multi-word spell triggers (last N words)
    for spell in SPELL_TRIGGERS:
        n = len(spell)
        if len(lw) >= n and tuple(lw[-n:]) == spell:
            return n, True
    return 0, False

def handle_text(text):
    global has_typed
    if not text.strip():
        return False
    words = text.strip().split()
    trigger_len, triggered = check_trigger(words)
    if triggered:
        clean = " ".join(words[:-trigger_len]) if trigger_len < len(words) else ""
        if clean:
            prefix = " " if has_typed else ""
            type_text(prefix + clean)
            has_typed = True
        time.sleep(0.05)
        press_enter()
        subprocess.run(["notify-send", "-a", "Voice", "-r", "9999", "-t", "2000", "Sent!"],
                      capture_output=True)
        return True
    else:
        prefix = " " if has_typed else ""
        type_text(prefix + text.strip())
        has_typed = True
        return False

# === Double-buffered pipeline ===
chunk_idx = 0
files = []

# Start first recording
cur_file, cur_rec = start_rec(chunk_idx)
files.append(cur_file)

while running:
    # Wait for chunk duration
    for _ in range(int(CHUNK_SECS * 10)):
        if not running:
            break
        time.sleep(0.1)

    # Stop current recording
    stop_rec(cur_rec)
    cur_rec = None

    if not running:
        text = transcribe_fast(cur_file)
        handle_text(text)
        break

    # IMMEDIATELY start next recording (zero gap)
    chunk_idx += 1
    next_file, next_rec = start_rec(chunk_idx)
    files.append(next_file)
    cur_rec = next_rec

    # Transcribe previous chunk while new one records
    text = transcribe_fast(cur_file)
    if handle_text(text):
        stop_rec(next_rec)
        cur_rec = None
        break

    # Clean old chunk
    try: os.unlink(cur_file)
    except: pass

    cur_file = next_file

# Cleanup
for f in files:
    try: os.unlink(f)
    except: pass
PYEOF

    echo $! > "$PID_FILE"
fi
