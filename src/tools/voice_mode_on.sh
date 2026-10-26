#!/usr/bin/env bash
# Start voice mode: launch STT daemon + enable TTS flag.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
VENV="${HYPR_TOOLS_VENV:-$REPO_DIR/voice-venv}"
DAEMON="$SCRIPT_DIR/voice_stt_daemon.py"
VENV_PYTHON="$VENV/bin/python3"
PID_FILE="/tmp/voice-stt-daemon.pid"
FLAG="/tmp/voice-tts-enabled"
SOCK="/tmp/voice-stt.sock"

notify() {
    notify-send -a "Voice" -t "${2:-3000}" "$1" 2>/dev/null || true
}

# Check if daemon is already running
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    notify "Voice mode already on."
    exit 0
fi

# Start daemon in background (with CUDA 12 compat libs via nvidia-cublas-cu12)
VENV_LIB="$VENV/lib"
LD_LIBRARY_PATH="$VENV_LIB:${LD_LIBRARY_PATH:-}" nohup "$VENV_PYTHON" "$DAEMON" &>/tmp/voice-stt-daemon.log &
disown

# Wait for socket to appear (model loading takes 3-5s)
notify "Loading STT model..." 10000
for i in $(seq 1 30); do
    if [[ -S "$SOCK" ]]; then
        break
    fi
    sleep 1
done

if [[ ! -S "$SOCK" ]]; then
    notify "STT daemon failed to start. Check /tmp/voice-stt-daemon.log"
    exit 1
fi

# Enable TTS
touch "$FLAG"

# Start TTS daemon if not running
TTS_DAEMON="$SCRIPT_DIR/voice_tts_daemon.py"
TTS_SOCK="/tmp/voice-tts-daemon.sock"
if [[ ! -S "$TTS_SOCK" ]]; then
    nohup python3 "$TTS_DAEMON" &>/tmp/voice-tts-daemon.log &
    disown
fi

notify "Voice mode ON"
