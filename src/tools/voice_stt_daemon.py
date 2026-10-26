#!/usr/bin/env python3
"""Persistent faster-whisper STT daemon with two models.

- tiny.en: fast streaming transcription (~100-300ms per 2s chunk on CPU)
- small.en: high-quality batch transcription

Clients send:
  {"audio_path": "...", "model": "tiny"}  → fast streaming
  {"audio_path": "...", "model": "small"} → high quality (default)
"""

import json
import os
import signal
import socket
import sys
import threading

SOCKET_PATH = "/tmp/voice-stt.sock"
PID_FILE = "/tmp/voice-stt-daemon.pid"
DEVICE = "cuda"
COMPUTE_TYPE = "int8"


def load_models():
    from faster_whisper import WhisperModel

    print("Loading small.en on GPU...", flush=True)
    small = WhisperModel("small.en", device=DEVICE, compute_type=COMPUTE_TYPE)
    print("Model loaded.", flush=True)
    return {"tiny": small, "small": small}


def transcribe(model, audio_path: str, beam_size: int = 5) -> str:
    if not os.path.isfile(audio_path):
        return ""
    segments, _ = model.transcribe(
        audio_path,
        beam_size=beam_size,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=300, speech_pad_ms=150),
    )
    return " ".join(seg.text.strip() for seg in segments).strip()


def handle_client(conn, models):
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
        audio_path = req.get("audio_path", "")
        model_name = req.get("model", "small")
        beam_size = req.get("beam_size", 5 if model_name == "small" else 1)
        model = models.get(model_name, models["small"])
        text = transcribe(model, audio_path, beam_size=beam_size)
        conn.sendall(json.dumps({"text": text}).encode())
    except Exception as e:
        try:
            conn.sendall(json.dumps({"error": str(e)}).encode())
        except Exception:
            pass
    finally:
        conn.close()


def cleanup(*_):
    for f in (SOCKET_PATH, PID_FILE):
        try:
            os.unlink(f)
        except FileNotFoundError:
            pass
    sys.exit(0)


def main():
    try:
        os.unlink(SOCKET_PATH)
    except FileNotFoundError:
        pass

    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    models = load_models()

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.bind(SOCKET_PATH)
    os.chmod(SOCKET_PATH, 0o660)
    sock.listen(4)
    print(f"Listening on {SOCKET_PATH}", flush=True)

    try:
        while True:
            conn, _ = sock.accept()
            t = threading.Thread(target=handle_client, args=(conn, models), daemon=True)
            t.start()
    except Exception:
        pass
    finally:
        sock.close()
        cleanup()


if __name__ == "__main__":
    main()
