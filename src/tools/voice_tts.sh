#!/usr/bin/env bash
# Claude Code Stop hook: submit text to TTS daemon.
# Daemon handles focus-gating (only focused session speaks) and preemption.
set -euo pipefail

FLAG="/tmp/voice-tts-enabled"
DAEMON_SOCK="/tmp/voice-tts-daemon.sock"
DAEMON_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/voice_tts_daemon.py"
MAX_CHARS=600

[[ -f "$FLAG" ]] || exit 0

INPUT=$(cat)

ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
[[ "$ACTIVE" == "true" ]] && exit 0

TEXT=$(echo "$INPUT" | jq -r '.last_assistant_message // ""')
[[ -z "$TEXT" ]] && exit 0

# Strip markdown, truncate
TEXT=$(python3 -c "
import re, sys
t = sys.stdin.read()
t = re.sub(r'\`\`\`[\s\S]*?\`\`\`', '', t)
t = re.sub(r'\`[^\`]+\`', '', t)
t = re.sub(r'^\s*#{1,6}\s+', '', t, flags=re.M)
t = re.sub(r'^\s*[-*]\s+', '', t, flags=re.M)
t = re.sub(r'\*\*([^*]+)\*\*', r'\1', t)
t = re.sub(r'\*([^*]+)\*', r'\1', t)
t = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', t)
t = re.sub(r'\n{2,}', '\n', t).strip()
if len(t) > $MAX_CHARS:
    t = t[:$MAX_CHARS] + '... truncated'
print(t)
" <<< "$TEXT")

[[ -z "$TEXT" ]] && exit 0

# Auto-start daemon if needed
if [[ ! -S "$DAEMON_SOCK" ]]; then
    nohup python3 "$DAEMON_SCRIPT" &>/tmp/voice-tts-daemon.log &
    disown
    for _ in $(seq 1 20); do
        [[ -S "$DAEMON_SOCK" ]] && break
        sleep 0.1
    done
    [[ -S "$DAEMON_SOCK" ]] || exit 0
fi

# Find our terminal ancestor PID
TERMINAL_PID=$(python3 -c "
import os
TERMS = {'kitty','alacritty','foot','wezterm','ghostty'}
pid = os.getpid()
seen = set()
while pid and pid > 1 and pid not in seen:
    seen.add(pid)
    try:
        comm = open(f'/proc/{pid}/comm').read().strip().lower()
    except: break
    if comm in TERMS:
        print(pid); exit()
    try:
        for l in open(f'/proc/{pid}/status'):
            if l.startswith('PPid:'): pid = int(l.split()[1]); break
    except: break
print(0)
")

[[ "$TERMINAL_PID" == "0" ]] && exit 0

# Submit to daemon (fire-and-forget)
python3 -c "
import socket, json, sys
text = sys.stdin.read()
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.settimeout(2)
try:
    s.connect('$DAEMON_SOCK')
    s.sendall(json.dumps({'cmd':'speak','text':text,'terminal_pid':$TERMINAL_PID}).encode())
    s.shutdown(socket.SHUT_WR)
    s.recv(64)
    s.close()
except: pass
" <<< "$TEXT"
