#!/usr/bin/env python3
"""
Per-Pixel LED Strip Controller for LEDDMX BLE LED Strip

Controls individual pixel colors via the custom pattern protocol decoded from
the decompiled LEDDMX Kotlin source (Dmx00Data.kt / CustomPatternMode.kt).

Protocol (0x7B header, 0xBF footer):
  Set pixel:    7B [pos] 0E FD [R] [G] [B] [listSize] BF
  Set mode:     7B FF 13 [mode] FF FF FF FF BF
  Set direction:7B FF 0D [dir]  FF FF FF FF BF

Dependencies: bleak, Pillow (PIL), numpy
System:       grim (Wayland screenshot capture)
"""

import asyncio
import colorsys
import io
import math
import signal
import struct
import subprocess
import sys
import json
import os
import time
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Optional

from bleak import BleakScanner, BleakClient

# ──────────────────────────────────────────────────────────────────────
# Device configuration (shared with led_strip.py)
# ──────────────────────────────────────────────────────────────────────

# Set HYPR_LED_ADDRESS to your strip's MAC; when unset the strip is found by scanning.
DEFAULT_ADDRESS = os.environ.get("HYPR_LED_ADDRESS", "")
SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb"
CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb"


LED_NAME_HINTS = ["LEDDMX", "LEDBLE", "ELK-BLEDOM", "LED"]


async def find_strip(address, timeout=5):
    """Find the strip by MAC, or by its advertised name when no MAC is set."""
    if address:
        return await BleakScanner.find_device_by_address(address, timeout=timeout)
    return await BleakScanner.find_device_by_filter(
        lambda d, adv: any(n.lower() in (d.name or adv.local_name or "").lower() for n in LED_NAME_HINTS),
        timeout=timeout,
    )

HEADER = 0x7B
FOOTER = 0xBF

# Maximum number of custom colors the strip firmware supports in one pattern.
# Determined from Dmx00Data.kt constraints.
MAX_CUSTOM_COLORS = 16

# BLE write pacing -- the strip's BLE stack needs time between packets.
WRITE_DELAY = 0.025  # 25ms between BLE writes


# ──────────────────────────────────────────────────────────────────────
# Custom Pattern Animation Modes  (CustomPatternMode.kt ordinals)
# ──────────────────────────────────────────────────────────────────────

class AnimationMode(IntEnum):
    GRADUAL = 0   # GD - smooth gradual transition
    FADE    = 1   # FD - fade between colors
    FORWARD = 2   # FW - forward scroll
    FAST    = 3   # FS - fast scroll
    OFF     = 4   # AC - static / animation off
    PULSE   = 5   # PU - pulsing effect
    FLASH   = 6   # FL - flash/strobe
    HOP     = 7   # HO - color hop


MODE_ALIASES = {
    "gradual": AnimationMode.GRADUAL, "gd": AnimationMode.GRADUAL,
    "fade":    AnimationMode.FADE,    "fd": AnimationMode.FADE,
    "forward": AnimationMode.FORWARD, "fw": AnimationMode.FORWARD,
    "fast":    AnimationMode.FAST,    "fs": AnimationMode.FAST,
    "off":     AnimationMode.OFF,     "ac": AnimationMode.OFF,
    "static":  AnimationMode.OFF,
    "pulse":   AnimationMode.PULSE,   "pu": AnimationMode.PULSE,
    "flash":   AnimationMode.FLASH,   "fl": AnimationMode.FLASH,
    "hop":     AnimationMode.HOP,     "ho": AnimationMode.HOP,
}


# ──────────────────────────────────────────────────────────────────────
# Color type
# ──────────────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class RGB:
    r: int
    g: int
    b: int

    def __post_init__(self):
        object.__setattr__(self, 'r', max(0, min(255, self.r)))
        object.__setattr__(self, 'g', max(0, min(255, self.g)))
        object.__setattr__(self, 'b', max(0, min(255, self.b)))

    @classmethod
    def from_hex(cls, h: str) -> "RGB":
        h = h.lstrip('#')
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        if len(h) != 6:
            raise ValueError(f"Invalid hex color: #{h}")
        return cls(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    @classmethod
    def from_hsv(cls, h: float, s: float, v: float) -> "RGB":
        """h in [0,360], s in [0,1], v in [0,1]"""
        r, g, b = colorsys.hsv_to_rgb(h / 360.0, s, v)
        return cls(int(r * 255), int(g * 255), int(b * 255))

    def to_tuple(self):
        return (self.r, self.g, self.b)

    def __repr__(self):
        return f"#{self.r:02x}{self.g:02x}{self.b:02x}"


# ──────────────────────────────────────────────────────────────────────
# Packet builders
# ──────────────────────────────────────────────────────────────────────

def pkt_set_pixel(position: int, r: int, g: int, b: int, list_size: int) -> bytes:
    """
    Build a per-pixel color packet.
    position: 1-based index in the color list
    list_size: total number of colors being programmed
    """
    return bytes([
        HEADER,
        position & 0xFF,
        0x0E,
        0xFD,
        r & 0xFF,
        g & 0xFF,
        b & 0xFF,
        list_size & 0xFF,
        FOOTER,
    ])


def pkt_animation_mode(mode: AnimationMode) -> bytes:
    """Set the custom pattern animation mode."""
    return bytes([
        HEADER, 0xFF, 0x13,
        int(mode) & 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF,
        FOOTER,
    ])


def pkt_direction(forward: bool = True) -> bytes:
    """Set the custom pattern scroll direction."""
    return bytes([
        HEADER, 0xFF, 0x0D,
        0x00 if forward else 0x01,
        0xFF, 0xFF, 0xFF, 0xFF,
        FOOTER,
    ])


def pkt_speed(speed: int) -> bytes:
    """Set animation speed (from Dmx00Data.kt -- cmd 0x02)."""
    speed = max(0, min(100, speed))
    adj = (speed * 32) // 100
    return bytes([
        HEADER, 0xFF, 0x02,
        adj, speed, 0xFF, 0xFF, 0xFF,
        FOOTER,
    ])


def pkt_power(on: bool) -> bytes:
    return bytes([HEADER, 0xFF, 0x04, 0x03 if on else 0x02, 0xFF, 0xFF, 0xFF, 0xFF, FOOTER])


# ──────────────────────────────────────────────────────────────────────
# BLE connection helper  (mirrors led_strip.py with shared retry logic)
# ──────────────────────────────────────────────────────────────────────

async def ble_connect(address: str = DEFAULT_ADDRESS, retries: int = 3) -> Optional[BleakClient]:
    """Connect to the LED strip with retry."""
    for attempt in range(retries):
        device = await find_strip(address)
        if not device:
            if attempt < retries - 1:
                await asyncio.sleep(0.5)
                continue
            print(f"[pixel] Device {address} not found after {retries} scans", file=sys.stderr)
            return None
        try:
            client = BleakClient(device, timeout=15.0)
            await client.connect(dangerous_use_bleak_cache=True)
            if client.is_connected:
                return client
        except Exception as exc:
            if attempt < retries - 1:
                await asyncio.sleep(1)
                continue
            print(f"[pixel] Connection failed: {exc}", file=sys.stderr)
    return None


async def ble_write(client: BleakClient, packet: bytes, delay: float = WRITE_DELAY):
    """Write a single packet with pacing delay."""
    await client.write_gatt_char(CHAR_UUID, packet, response=False)
    if delay > 0:
        await asyncio.sleep(delay)


# ──────────────────────────────────────────────────────────────────────
# Core pixel control
# ──────────────────────────────────────────────────────────────────────

async def set_pixel_colors(
    client: BleakClient,
    colors: list[RGB],
    mode: AnimationMode = AnimationMode.GRADUAL,
    forward: bool = True,
    speed: int = 50,
):
    """
    Program a list of per-pixel colors into the custom pattern and activate it.

    Steps:
      1. Send each pixel color packet (position 1..N)
      2. Set animation mode
      3. Set scroll direction
      4. Set speed
    """
    if not colors:
        raise ValueError("Color list must not be empty")

    count = min(len(colors), MAX_CUSTOM_COLORS)
    if len(colors) > MAX_CUSTOM_COLORS:
        print(
            f"[pixel] Warning: truncating {len(colors)} colors to firmware max {MAX_CUSTOM_COLORS}",
            file=sys.stderr,
        )

    # 1. Program each pixel
    for i, color in enumerate(colors[:count]):
        pkt = pkt_set_pixel(i + 1, color.r, color.g, color.b, count)
        await ble_write(client, pkt)

    # 2. Set animation mode
    await ble_write(client, pkt_animation_mode(mode))

    # 3. Set direction
    await ble_write(client, pkt_direction(forward))

    # 4. Set speed
    await ble_write(client, pkt_speed(speed))


async def set_custom_pattern(
    address: str,
    colors: list[RGB],
    mode: AnimationMode = AnimationMode.GRADUAL,
    forward: bool = True,
    speed: int = 50,
):
    """High-level: connect, program pattern, disconnect."""
    client = await ble_connect(address)
    if not client:
        return False
    try:
        await set_pixel_colors(client, colors, mode, forward, speed)
        mode_name = AnimationMode(mode).name.lower()
        direction = "fwd" if forward else "rev"
        print(f"[pixel] Set {len(colors)} colors, mode={mode_name}, dir={direction}, speed={speed}")
        return True
    except Exception as exc:
        print(f"[pixel] Error: {exc}", file=sys.stderr)
        return False
    finally:
        await client.disconnect()


async def set_mode_and_direction(
    address: str,
    mode: AnimationMode,
    forward: bool = True,
    speed: Optional[int] = None,
):
    """Change animation mode and direction without reprogramming colors."""
    client = await ble_connect(address)
    if not client:
        return False
    try:
        await ble_write(client, pkt_animation_mode(mode))
        await ble_write(client, pkt_direction(forward))
        if speed is not None:
            await ble_write(client, pkt_speed(speed))
        mode_name = AnimationMode(mode).name.lower()
        direction = "fwd" if forward else "rev"
        print(f"[pixel] Mode={mode_name}, dir={direction}" + (f", speed={speed}" if speed is not None else ""))
        return True
    except Exception as exc:
        print(f"[pixel] Error: {exc}", file=sys.stderr)
        return False
    finally:
        await client.disconnect()


# ──────────────────────────────────────────────────────────────────────
# Gradient / wave effect generators
# ──────────────────────────────────────────────────────────────────────

def generate_gradient(start: RGB, end: RGB, steps: int = 16) -> list[RGB]:
    """Linear interpolation between two colors."""
    steps = max(2, min(steps, MAX_CUSTOM_COLORS))
    colors = []
    for i in range(steps):
        t = i / (steps - 1)
        r = int(start.r + (end.r - start.r) * t)
        g = int(start.g + (end.g - start.g) * t)
        b = int(start.b + (end.b - start.b) * t)
        colors.append(RGB(r, g, b))
    return colors


def generate_rainbow(steps: int = 16, saturation: float = 1.0, value: float = 1.0) -> list[RGB]:
    """Full HSV rainbow across the pixel positions."""
    steps = max(2, min(steps, MAX_CUSTOM_COLORS))
    return [
        RGB.from_hsv(i * 360.0 / steps, saturation, value)
        for i in range(steps)
    ]


def generate_wave(
    base_hue: float,
    steps: int = 16,
    hue_spread: float = 60.0,
    saturation: float = 1.0,
    value: float = 1.0,
) -> list[RGB]:
    """
    Sinusoidal hue wave centered on base_hue.
    hue_spread: peak-to-peak hue variation in degrees.
    """
    steps = max(2, min(steps, MAX_CUSTOM_COLORS))
    colors = []
    for i in range(steps):
        phase = math.sin(2 * math.pi * i / steps)
        hue = (base_hue + phase * hue_spread / 2) % 360
        colors.append(RGB.from_hsv(hue, saturation, value))
    return colors


def generate_breathing(color: RGB, steps: int = 16) -> list[RGB]:
    """Brightness ramp for a breathing/pulsing effect on a single hue."""
    steps = max(2, min(steps, MAX_CUSTOM_COLORS))
    colors = []
    for i in range(steps):
        # Sinusoidal brightness curve
        brightness = (math.sin(2 * math.pi * i / steps - math.pi / 2) + 1) / 2
        brightness = max(0.05, brightness)  # never fully black
        r = int(color.r * brightness)
        g = int(color.g * brightness)
        b = int(color.b * brightness)
        colors.append(RGB(r, g, b))
    return colors


def generate_fire(steps: int = 16) -> list[RGB]:
    """Fire/lava color gradient: black -> red -> orange -> yellow -> white tip."""
    keyframes = [
        (0.00, RGB(0, 0, 0)),
        (0.20, RGB(128, 0, 0)),
        (0.45, RGB(255, 40, 0)),
        (0.70, RGB(255, 150, 0)),
        (0.85, RGB(255, 220, 50)),
        (1.00, RGB(255, 255, 200)),
    ]
    steps = max(2, min(steps, MAX_CUSTOM_COLORS))
    colors = []
    for i in range(steps):
        t = i / (steps - 1)
        # Find surrounding keyframes
        for k in range(len(keyframes) - 1):
            t0, c0 = keyframes[k]
            t1, c1 = keyframes[k + 1]
            if t0 <= t <= t1:
                local_t = (t - t0) / (t1 - t0) if t1 != t0 else 0
                r = int(c0.r + (c1.r - c0.r) * local_t)
                g = int(c0.g + (c1.g - c0.g) * local_t)
                b = int(c0.b + (c1.b - c0.b) * local_t)
                colors.append(RGB(r, g, b))
                break
    return colors


def generate_ocean(steps: int = 16) -> list[RGB]:
    """Deep ocean gradient: dark blue -> teal -> cyan -> white foam."""
    keyframes = [
        (0.00, RGB(0, 5, 40)),
        (0.30, RGB(0, 40, 120)),
        (0.55, RGB(0, 100, 180)),
        (0.75, RGB(0, 180, 200)),
        (0.90, RGB(100, 220, 240)),
        (1.00, RGB(200, 255, 255)),
    ]
    steps = max(2, min(steps, MAX_CUSTOM_COLORS))
    colors = []
    for i in range(steps):
        t = i / (steps - 1)
        for k in range(len(keyframes) - 1):
            t0, c0 = keyframes[k]
            t1, c1 = keyframes[k + 1]
            if t0 <= t <= t1:
                local_t = (t - t0) / (t1 - t0) if t1 != t0 else 0
                r = int(c0.r + (c1.r - c0.r) * local_t)
                g = int(c0.g + (c1.g - c0.g) * local_t)
                b = int(c0.b + (c1.b - c0.b) * local_t)
                colors.append(RGB(r, g, b))
                break
    return colors


PRESETS = {
    "rainbow":   lambda n: generate_rainbow(n),
    "fire":      lambda n: generate_fire(n),
    "ocean":     lambda n: generate_ocean(n),
    "sunset":    lambda n: generate_gradient(RGB(255, 50, 0), RGB(100, 0, 200), n),
    "forest":    lambda n: generate_gradient(RGB(0, 80, 0), RGB(100, 255, 50), n),
    "ice":       lambda n: generate_gradient(RGB(200, 220, 255), RGB(0, 50, 200), n),
    "lava":      lambda n: generate_gradient(RGB(200, 0, 0), RGB(255, 200, 0), n),
    "neon":      lambda n: generate_gradient(RGB(255, 0, 255), RGB(0, 255, 255), n),
    "warm":      lambda n: generate_gradient(RGB(255, 100, 20), RGB(255, 220, 150), n),
    "cool":      lambda n: generate_gradient(RGB(0, 100, 255), RGB(150, 0, 255), n),
    "christmas": lambda n: [RGB(255, 0, 0) if i % 2 == 0 else RGB(0, 255, 0) for i in range(min(n, MAX_CUSTOM_COLORS))],
    "usa":       lambda n: [RGB(255, 0, 0) if i % 3 == 0 else RGB(255, 255, 255) if i % 3 == 1 else RGB(0, 0, 255) for i in range(min(n, MAX_CUSTOM_COLORS))],
    "police":    lambda n: [RGB(255, 0, 0) if i % 2 == 0 else RGB(0, 0, 255) for i in range(min(n, MAX_CUSTOM_COLORS))],
}


# ──────────────────────────────────────────────────────────────────────
# Screen capture -> LED  (ambilight / screen-reactive)
# ──────────────────────────────────────────────────────────────────────

def capture_screen() -> "Image.Image":
    """Capture the focused monitor using grim (Wayland)."""
    from PIL import Image

    result = subprocess.run(
        ["grim", "-t", "png", "-"],
        capture_output=True,
        timeout=5,
    )
    if result.returncode != 0:
        raise RuntimeError(f"grim failed (exit {result.returncode}): {result.stderr.decode().strip()}")
    return Image.open(io.BytesIO(result.stdout))


def dominant_color_from_region(img: "Image.Image", box: tuple[int, int, int, int]) -> RGB:
    """
    Extract the dominant color from a rectangular region using average with
    saturation boosting.  box = (left, top, right, bottom).
    """
    import numpy as np

    region = img.crop(box).convert("RGB")
    # Downsample for speed
    region = region.resize((32, 32), resample=0)
    pixels = np.array(region, dtype=np.float64).reshape(-1, 3)

    # Weighted average: boost saturated pixels to avoid washed-out results
    hsv_pixels = np.array([colorsys.rgb_to_hsv(r / 255, g / 255, b / 255) for r, g, b in pixels])
    saturation = hsv_pixels[:, 1]
    value = hsv_pixels[:, 2]
    weights = (saturation * 0.7 + 0.3) * (value * 0.5 + 0.5)
    weights = weights / weights.sum()

    avg = (pixels * weights[:, np.newaxis]).sum(axis=0)
    r, g, b = int(avg[0]), int(avg[1]), int(avg[2])

    # Boost saturation of the result by 30% for more vivid LEDs
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    s = min(1.0, s * 1.3)
    v = min(1.0, v * 1.1)
    r2, g2, b2 = colorsys.hsv_to_rgb(h, s, v)
    return RGB(int(r2 * 255), int(g2 * 255), int(b2 * 255))


def sample_screen_colors(num_segments: int = 16) -> list[RGB]:
    """
    Capture the screen and divide it into vertical segments along the
    bottom edge (like an ambilight strip behind a monitor).  Returns one
    dominant color per segment.
    """
    num_segments = max(2, min(num_segments, MAX_CUSTOM_COLORS))
    img = capture_screen()
    w, h = img.size

    # Sample the bottom 25% of the screen (where most content color bleeds)
    top = int(h * 0.75)
    seg_width = w / num_segments

    colors = []
    for i in range(num_segments):
        left = int(i * seg_width)
        right = int((i + 1) * seg_width)
        box = (left, top, right, h)
        colors.append(dominant_color_from_region(img, box))

    return colors


def sample_screen_edges(num_segments: int = 16) -> list[RGB]:
    """
    Sample colors from around the screen edges (full ambilight style):
    bottom-left -> bottom-right -> right-side-up -> top-right -> top-left -> left-side-down.
    Maps to LED strip positions sequentially.
    """
    num_segments = max(4, min(num_segments, MAX_CUSTOM_COLORS))
    img = capture_screen()
    w, h = img.size

    edge_thickness_x = max(1, w // 8)
    edge_thickness_y = max(1, h // 8)

    # Distribute segments across edges: bottom gets most, sides and top share rest
    n_bottom = max(1, num_segments // 2)
    n_remaining = num_segments - n_bottom
    n_right = max(1, n_remaining // 3)
    n_top = max(1, n_remaining // 3)
    n_left = num_segments - n_bottom - n_right - n_top

    colors = []

    # Bottom edge: left to right
    seg_w = w / n_bottom
    for i in range(n_bottom):
        box = (int(i * seg_w), h - edge_thickness_y, int((i + 1) * seg_w), h)
        colors.append(dominant_color_from_region(img, box))

    # Right edge: bottom to top
    seg_h = h / n_right
    for i in range(n_right):
        y = h - int((i + 1) * seg_h)
        box = (w - edge_thickness_x, y, w, y + int(seg_h))
        colors.append(dominant_color_from_region(img, box))

    # Top edge: right to left
    seg_w = w / n_top
    for i in range(n_top):
        x = w - int((i + 1) * seg_w)
        box = (x, 0, x + int(seg_w), edge_thickness_y)
        colors.append(dominant_color_from_region(img, box))

    # Left edge: top to bottom
    seg_h = h / n_left
    for i in range(n_left):
        box = (0, int(i * seg_h), edge_thickness_x, int((i + 1) * seg_h))
        colors.append(dominant_color_from_region(img, box))

    return colors[:num_segments]


async def screen_to_led(
    address: str = DEFAULT_ADDRESS,
    num_segments: int = 16,
    mode: AnimationMode = AnimationMode.GRADUAL,
    forward: bool = True,
    speed: int = 50,
    edge_mode: bool = False,
):
    """
    One-shot: capture the screen, extract dominant colors, push to LEDs.
    """
    try:
        if edge_mode:
            colors = sample_screen_edges(num_segments)
        else:
            colors = sample_screen_colors(num_segments)
    except Exception as exc:
        print(f"[pixel] Screen capture failed: {exc}", file=sys.stderr)
        return False

    print(f"[pixel] Screen colors: {' '.join(str(c) for c in colors)}")
    return await set_custom_pattern(address, colors, mode, forward, speed)


async def screen_to_led_live(
    address: str = DEFAULT_ADDRESS,
    num_segments: int = 16,
    interval: float = 2.0,
    mode: AnimationMode = AnimationMode.OFF,
    forward: bool = True,
    speed: int = 50,
    edge_mode: bool = False,
):
    """
    Continuous ambilight: repeatedly capture the screen and update LEDs.
    Uses AnimationMode.OFF (static) by default for minimal firmware animation
    so the LED colors directly reflect the screen.
    Runs until interrupted with Ctrl+C.
    """
    client = await ble_connect(address)
    if not client:
        return

    # Set mode and direction once
    await ble_write(client, pkt_animation_mode(mode))
    await ble_write(client, pkt_direction(forward))
    await ble_write(client, pkt_speed(speed))

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGINT, stop.set)
    loop.add_signal_handler(signal.SIGTERM, stop.set)

    frame = 0
    print(f"[pixel] Live screen capture started (interval={interval}s, segments={num_segments})")
    print("[pixel] Press Ctrl+C to stop")

    try:
        while not stop.is_set():
            t0 = time.monotonic()
            try:
                if edge_mode:
                    colors = sample_screen_edges(num_segments)
                else:
                    colors = sample_screen_colors(num_segments)
            except Exception as exc:
                print(f"[pixel] Capture error (frame {frame}): {exc}", file=sys.stderr)
                await asyncio.sleep(interval)
                continue

            count = min(len(colors), MAX_CUSTOM_COLORS)
            for i, color in enumerate(colors[:count]):
                pkt = pkt_set_pixel(i + 1, color.r, color.g, color.b, count)
                try:
                    await ble_write(client, pkt, delay=WRITE_DELAY)
                except Exception as exc:
                    print(f"[pixel] BLE write error: {exc}", file=sys.stderr)
                    # Try to reconnect
                    try:
                        await client.disconnect()
                    except Exception:
                        pass
                    client = await ble_connect(address)
                    if not client:
                        print("[pixel] Reconnection failed, stopping", file=sys.stderr)
                        return
                    # Re-set mode after reconnect
                    await ble_write(client, pkt_animation_mode(mode))
                    await ble_write(client, pkt_direction(forward))
                    await ble_write(client, pkt_speed(speed))
                    break  # skip rest of this frame

            elapsed = time.monotonic() - t0
            frame += 1
            if frame % 10 == 0:
                print(f"[pixel] Frame {frame}, {elapsed:.2f}s")

            remaining = interval - elapsed
            if remaining > 0:
                try:
                    await asyncio.wait_for(stop.wait(), timeout=remaining)
                except asyncio.TimeoutError:
                    pass
    finally:
        print(f"\n[pixel] Stopped after {frame} frames")
        try:
            await client.disconnect()
        except Exception:
            pass


# ──────────────────────────────────────────────────────────────────────
# CLI interface
# ──────────────────────────────────────────────────────────────────────

def parse_color_arg(s: str) -> RGB:
    """Parse a color from hex (#ff0000) or r,g,b (255,0,0) format."""
    s = s.strip()
    if s.startswith('#') or (len(s) == 6 and all(c in '0123456789abcdefABCDEF' for c in s)):
        return RGB.from_hex(s)
    parts = s.split(',')
    if len(parts) == 3:
        return RGB(int(parts[0]), int(parts[1]), int(parts[2]))
    raise ValueError(f"Cannot parse color: '{s}' (use #rrggbb or r,g,b)")


def parse_color_list(args: list[str]) -> list[RGB]:
    """Parse multiple color arguments."""
    colors = []
    for arg in args:
        # Support space-separated or semicolon-separated lists
        for part in arg.replace(';', ' ').split():
            colors.append(parse_color_arg(part))
    return colors


def print_usage():
    print("""LEDDMX Per-Pixel LED Controller

Usage:
  led_pixel.py [address] <command> [args...]

Address defaults to """ + DEFAULT_ADDRESS + """

Commands:
  colors <color1> <color2> ...  Set individual pixel colors
                                Colors: #rrggbb or r,g,b
                                Options: --mode <mode> --speed <0-100>
                                         --reverse --count <n>

  preset <name> [count]         Use a preset gradient/pattern
                                Options: --mode <mode> --speed <0-100> --reverse

  mode <mode> [--reverse]       Change animation mode without reprogramming
              [--speed N]       Modes: gradual fade forward fast static
                                       pulse flash hop

  gradient <start> <end> [n]    Linear gradient between two colors

  wave <hue> [--spread N]       Sinusoidal hue wave (hue in degrees 0-360)
             [--count N]

  screen [--segments N]         One-shot screen capture to LEDs
         [--edges]              Use --edges for full edge sampling

  live [--interval N]           Continuous ambilight screen capture
       [--segments N] [--edges]

  breathing <color> [count]     Breathing/pulsing single-color effect

Presets: """ + ', '.join(sorted(PRESETS.keys())) + """

Modes: """ + ', '.join(f"{m.name.lower()} ({m.value})" for m in AnimationMode) + """

Examples:
  led_pixel.py colors #ff0000 #00ff00 #0000ff
  led_pixel.py colors 255,0,0 0,255,0 0,0,255 --mode forward --speed 70
  led_pixel.py preset rainbow --mode forward --speed 80
  led_pixel.py preset fire --mode gradual
  led_pixel.py gradient #ff0000 #0000ff 12 --mode fade
  led_pixel.py wave 200 --spread 90 --count 16 --mode forward
  led_pixel.py screen --segments 12 --edges
  led_pixel.py live --interval 1.5 --segments 10
  led_pixel.py mode pulse --speed 60
  led_pixel.py breathing #ff00ff 12 --mode pulse""")


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help', 'help'):
        print_usage()
        sys.exit(0)

    # Parse optional address
    if ':' in args[0] and len(args[0]) == 17:
        address = args[0]
        args = args[1:]
    else:
        address = DEFAULT_ADDRESS

    if not args:
        print_usage()
        sys.exit(1)

    cmd = args[0].lower()
    rest = args[1:]

    # Extract common flags
    mode = AnimationMode.GRADUAL
    speed = 50
    forward = True
    count = MAX_CUSTOM_COLORS
    segments = MAX_CUSTOM_COLORS
    interval = 2.0
    edge_mode = False
    hue_spread = 60.0

    # Pull flags out of rest
    positional = []
    i = 0
    while i < len(rest):
        a = rest[i]
        if a == '--mode' and i + 1 < len(rest):
            mode_str = rest[i + 1].lower()
            if mode_str in MODE_ALIASES:
                mode = MODE_ALIASES[mode_str]
            elif mode_str.isdigit():
                mode = AnimationMode(int(mode_str))
            else:
                print(f"Unknown mode: {mode_str}", file=sys.stderr)
                print(f"Available: {', '.join(MODE_ALIASES.keys())}", file=sys.stderr)
                sys.exit(1)
            i += 2
        elif a == '--speed' and i + 1 < len(rest):
            speed = int(rest[i + 1])
            i += 2
        elif a == '--reverse' or a == '-r':
            forward = False
            i += 1
        elif a == '--forward' or a == '-f':
            forward = True
            i += 1
        elif a == '--count' and i + 1 < len(rest):
            count = int(rest[i + 1])
            i += 2
        elif a == '--segments' and i + 1 < len(rest):
            segments = int(rest[i + 1])
            i += 2
        elif a == '--interval' and i + 1 < len(rest):
            interval = float(rest[i + 1])
            i += 2
        elif a == '--edges':
            edge_mode = True
            i += 1
        elif a == '--spread' and i + 1 < len(rest):
            hue_spread = float(rest[i + 1])
            i += 2
        else:
            positional.append(a)
            i += 1

    # ── Command dispatch ──

    if cmd == 'colors':
        if not positional:
            print("Error: provide at least one color (#rrggbb or r,g,b)", file=sys.stderr)
            sys.exit(1)
        colors = parse_color_list(positional)
        asyncio.run(set_custom_pattern(address, colors, mode, forward, speed))

    elif cmd == 'preset':
        if not positional:
            print(f"Available presets: {', '.join(sorted(PRESETS.keys()))}", file=sys.stderr)
            sys.exit(1)
        name = positional[0].lower()
        if name not in PRESETS:
            print(f"Unknown preset: {name}", file=sys.stderr)
            print(f"Available: {', '.join(sorted(PRESETS.keys()))}", file=sys.stderr)
            sys.exit(1)
        n = int(positional[1]) if len(positional) > 1 else count
        n = min(n, MAX_CUSTOM_COLORS)
        colors = PRESETS[name](n)
        asyncio.run(set_custom_pattern(address, colors, mode, forward, speed))

    elif cmd == 'mode':
        if not positional:
            print("Specify a mode: " + ', '.join(MODE_ALIASES.keys()), file=sys.stderr)
            sys.exit(1)
        mode_str = positional[0].lower()
        if mode_str in MODE_ALIASES:
            mode = MODE_ALIASES[mode_str]
        elif mode_str.isdigit():
            mode = AnimationMode(int(mode_str))
        else:
            print(f"Unknown mode: {mode_str}", file=sys.stderr)
            sys.exit(1)
        spd = int(positional[1]) if len(positional) > 1 else speed
        asyncio.run(set_mode_and_direction(address, mode, forward, spd))

    elif cmd == 'gradient':
        if len(positional) < 2:
            print("Usage: gradient <start_color> <end_color> [steps]", file=sys.stderr)
            sys.exit(1)
        c_start = parse_color_arg(positional[0])
        c_end = parse_color_arg(positional[1])
        n = int(positional[2]) if len(positional) > 2 else count
        colors = generate_gradient(c_start, c_end, min(n, MAX_CUSTOM_COLORS))
        asyncio.run(set_custom_pattern(address, colors, mode, forward, speed))

    elif cmd == 'wave':
        if not positional:
            print("Usage: wave <base_hue_degrees> [--spread N] [--count N]", file=sys.stderr)
            sys.exit(1)
        base_hue = float(positional[0])
        colors = generate_wave(base_hue, min(count, MAX_CUSTOM_COLORS), hue_spread)
        asyncio.run(set_custom_pattern(address, colors, mode, forward, speed))

    elif cmd == 'breathing':
        if not positional:
            print("Usage: breathing <color> [count]", file=sys.stderr)
            sys.exit(1)
        color = parse_color_arg(positional[0])
        n = int(positional[1]) if len(positional) > 1 else count
        colors = generate_breathing(color, min(n, MAX_CUSTOM_COLORS))
        asyncio.run(set_custom_pattern(address, colors, mode, forward, speed))

    elif cmd == 'screen':
        asyncio.run(screen_to_led(address, segments, mode, forward, speed, edge_mode))

    elif cmd == 'live':
        asyncio.run(screen_to_led_live(address, segments, interval, mode, forward, speed, edge_mode))

    elif cmd == 'power':
        on = positional[0].lower() in ('on', '1', 'true') if positional else True
        async def _power():
            client = await ble_connect(address)
            if client:
                try:
                    await ble_write(client, pkt_power(on))
                    print(f"[pixel] Power {'on' if on else 'off'}")
                finally:
                    await client.disconnect()
        asyncio.run(_power())

    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        print_usage()
        sys.exit(1)


if __name__ == "__main__":
    main()
