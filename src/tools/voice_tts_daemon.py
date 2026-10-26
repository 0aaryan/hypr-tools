#!/usr/bin/env python3
"""
TTS daemon — single process handles all Claude Code sessions.
Only the focused terminal's session speaks. Others are dropped.
New submissions preempt current playback (no overlap).
Socket: /tmp/voice-tts-daemon.sock
"""
import asyncio
import json
import os
import signal
import socket
import subprocess
import sys
import threading

SOCKET_PATH = "/tmp/voice-tts-daemon.sock"
PID_FILE = "/tmp/voice-tts-daemon.pid"
VOICE = "en-IN-NeerjaExpressiveNeural"
TERMINAL_NAMES = {"kitty", "alacritty", "foot", "wezterm", "ghostty"}


def get_ppid(pid):
    try:
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("PPid:"):
                    return int(line.split()[1])
    except OSError:
        pass
    return None


def get_comm(pid):
    try:
        with open(f"/proc/{pid}/comm") as f:
            return f.read().strip().lower()
    except OSError:
        return ""


def get_focused_terminal_pid():
    try:
        r = subprocess.run(
            ["hyprctl", "activewindow", "-j"],
            capture_output=True, text=True, timeout=2,
        )
        data = json.loads(r.stdout)
        if data.get("class", "").lower() in TERMINAL_NAMES:
            return data.get("pid")
    except Exception:
        pass
    return None


class TTSEngine:
    def __init__(self):
        self._lock = threading.Lock()
        self._ffplay = None
        self._thread = None
        self._cancel = threading.Event()

    def submit(self, text, terminal_pid):
        focused = get_focused_terminal_pid()
        # Allow if: focused matches, OR no terminal focused and nothing playing
        if focused is not None and terminal_pid != focused:
            return "dropped"
        if focused is None:
            with self._lock:
                if self._ffplay is not None:
                    return "dropped"

        # Kill current playback
        with self._lock:
            self._cancel.set()
            if self._ffplay and self._ffplay.poll() is None:
                try:
                    self._ffplay.stdin.close()
                except Exception:
                    pass
                try:
                    self._ffplay.terminate()
                except Exception:
                    pass
            old = self._thread
        if old and old.is_alive():
            old.join(timeout=1.0)

        # Start new
        with self._lock:
            self._cancel = threading.Event()
            cancel = self._cancel
            t = threading.Thread(target=self._play, args=(text, cancel), daemon=True)
            self._thread = t
        t.start()
        return "playing"

    def _play(self, text, cancel):
        import edge_tts

        ffplay = subprocess.Popen(
            ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet",
             "-f", "mp3", "-i", "pipe:0"],
            stdin=subprocess.PIPE,
        )
        with self._lock:
            self._ffplay = ffplay

        async def stream():
            comm = edge_tts.Communicate(text, VOICE)
            async for chunk in comm.stream():
                if cancel.is_set():
                    break
                if chunk["type"] == "audio" and chunk["data"]:
                    try:
                        ffplay.stdin.write(chunk["data"])
                        ffplay.stdin.flush()
                    except BrokenPipeError:
                        break

        try:
            asyncio.run(stream())
        except Exception:
            pass
        finally:
            try:
                ffplay.stdin.close()
            except Exception:
                pass
            ffplay.wait()
            with self._lock:
                if self._ffplay is ffplay:
                    self._ffplay = None

    def stop(self):
        with self._lock:
            self._cancel.set()
            if self._ffplay and self._ffplay.poll() is None:
                try:
                    self._ffplay.stdin.close()
                    self._ffplay.terminate()
                except Exception:
                    pass


def handle_client(conn, engine):
    try:
        data = b""
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            data += chunk
        if not data:
            return
        req = json.loads(data.decode())
        cmd = req.get("cmd", "speak")

        if cmd == "speak":
            text = req.get("text", "")
            tpid = req.get("terminal_pid", 0)
            result = engine.submit(text, tpid) if text and tpid else "error"
            conn.sendall((result + "\n").encode())
        elif cmd == "stop":
            engine.stop()
            conn.sendall(b"stopped\n")
        elif cmd == "ping":
            conn.sendall(b"pong\n")
    except Exception as e:
        try:
            conn.sendall(f"error: {e}\n".encode())
        except Exception:
            pass
    finally:
        conn.close()


def main():
    engine = TTSEngine()

    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(SOCKET_PATH)
    os.chmod(SOCKET_PATH, 0o600)
    srv.listen(16)

    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    print(f"TTS daemon listening on {SOCKET_PATH}", flush=True)

    def cleanup(sig, frame):
        engine.stop()
        srv.close()
        try:
            os.unlink(SOCKET_PATH)
        except OSError:
            pass
        try:
            os.unlink(PID_FILE)
        except OSError:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    while True:
        try:
            conn, _ = srv.accept()
        except OSError:
            break
        threading.Thread(target=handle_client, args=(conn, engine), daemon=True).start()


if __name__ == "__main__":
    main()
