#!/usr/bin/env bash
# Stop voice mode: kill STT daemon + disable TTS + cleanup.

set -euo pipefail

PID_FILE="/tmp/voice-stt-daemon.pid"
REC_PID_FILE="/tmp/voice-recording.pid"
FLAG="/tmp/voice-tts-enabled"
SOCK="/tmp/voice-stt.sock"

notify() {
    notify-send -a "Voice" -t "${2:-3000}" "$1" 2>/dev/null || true
}

# Kill any active recording
if [[ -f "$REC_PID_FILE" ]]; then
    kill "$(cat "$REC_PID_FILE")" 2>/dev/null || true
    rm -f "$REC_PID_FILE"
fi

# Kill daemon
if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
fi

# Kill TTS daemon
TTS_PID="/tmp/voice-tts-daemon.pid"
TTS_SOCK="/tmp/voice-tts-daemon.sock"
if [[ -f "$TTS_PID" ]]; then
    kill "$(cat "$TTS_PID")" 2>/dev/null || true
    rm -f "$TTS_PID"
fi
pkill -f "ffplay.*pipe" 2>/dev/null || true
pkill -f "pw-record.*voice-chunk" 2>/dev/null || true

# Clean up
rm -f "$FLAG" "$SOCK" "$TTS_SOCK" /tmp/voice-input.wav /tmp/voice-tts-text /tmp/voice-chunk-*.wav /tmp/voice-target

notify "Voice mode OFF"
