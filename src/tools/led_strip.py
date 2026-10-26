#!/usr/bin/env python3
"""
BLE LED Strip Controller for LEDDMX-00/LEDDMX-03
Protocol: 0x7B [0xFF] [CMD] [DATA...] 0xBF (9-byte packets)
Service: 0000ffe0, Characteristic: 0000ffe1
Decoded from: github.com/user154lt/LEDDMX-00
"""
import asyncio
import sys
import json
import os
from bleak import BleakScanner, BleakClient

# Device config
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

LED_NAMES = ["LEDDMX", "LEDBLE", "ELK-BLEDOM", "LED"]

# ═══ LEDDMX Protocol: header=0x7B, footer=0xBF ═══

def pkt_power(on: bool):
    return bytes([0x7B, 0xFF, 0x04, 0x03 if on else 0x02, 0xFF, 0xFF, 0xFF, 0xFF, 0xBF])

def pkt_color(r: int, g: int, b: int):
    return bytes([0x7B, 0xFF, 0x07, r & 0xFF, g & 0xFF, b & 0xFF, 0x00, 0xFF, 0xBF])

def pkt_brightness(level: int):
    pct = max(0, min(100, level))
    adj = (pct * 32) // 100
    return bytes([0x7B, 0xFF, 0x01, adj, pct, 0x00, 0xFF, 0xFF, 0xBF])

def pkt_pattern(index: int):
    return bytes([0x7B, 0xFF, 0x03, max(0, min(210, index)), 0xFF, 0xFF, 0xFF, 0xFF, 0xBF])

def pkt_color_temp(pct: int):
    pct = max(0, min(100, pct))
    adj = (pct * 32) // 100
    return bytes([0x7B, 0xFF, 0x09, adj, pct, 0xFF, 0xFF, 0xFF, 0xBF])

def pkt_mic_eq(mode: int):
    return bytes([0x7B, 0xFF, 0x0B, max(0, min(255, mode)), 0x00, 0xFF, 0xFF, 0xBF])

# Pattern names (index 0-210)
PATTERNS = [
    "off", "fwd_dreaming", "bwd_dreaming", "fwd_7colors", "bwd_7colors",
    "fwd_rgb", "bwd_rgb", "fwd_ycv", "bwd_ycv",
    "fwd_6c_red", "bwd_6c_red", "fwd_6c_green", "bwd_6c_green",
    "fwd_6c_blue", "bwd_6c_blue", "fwd_6c_cyan", "bwd_6c_cyan",
    "fwd_6c_yellow", "bwd_6c_yellow", "fwd_6c_violet", "bwd_6c_violet",
    "fwd_6c_white", "bwd_6c_white",
    "fwd_trail_7c", "bwd_trail_7c", "fwd_trail_red", "bwd_trail_red",
    "fwd_trail_green", "bwd_trail_green", "fwd_trail_blue", "bwd_trail_blue",
    "fwd_trail_yellow", "bwd_trail_yellow", "fwd_trail_cyan", "bwd_trail_cyan",
    "fwd_trail_violet", "bwd_trail_violet", "fwd_trail_white", "bwd_trail_white",
    "fwd_stream_7c", "bwd_stream_7c", "fwd_stream_rgb", "bwd_stream_rgb",
    "fwd_stream_ycv", "bwd_stream_ycv",
    "fwd_stream_rg", "bwd_stream_rg", "fwd_stream_gb", "bwd_stream_gb",
    "fwd_stream_yb", "bwd_stream_yb", "fwd_stream_yc", "bwd_stream_yc",
    "fwd_stream_cv", "bwd_stream_cv", "fwd_stream_bw", "bwd_stream_bw",
    "open_curtain_7c", "close_curtain_7c", "open_curtain_rgb", "close_curtain_rgb",
    "open_curtain_ycv", "close_curtain_ycv",
    "fwd_spotlight_7c", "bwd_spotlight_7c", "fwd_spotlight_rgb", "bwd_spotlight_rgb",
    "fwd_spotlight_ycv", "bwd_spotlight_ycv",
    "fwd_flutter_7c", "bwd_flutter_7c", "fwd_flutter_rgb", "bwd_flutter_rgb",
    "fwd_flutter_ycv", "bwd_flutter_ycv",
    "hop_7c", "hop_rgb", "hop_ycv",
    "strobe_7c", "strobe_rgb", "strobe_ycv",
    "gradual_7c", "gradual_re", "gradual_rv", "gradual_gc", "gradual_gy", "gradual_bv",
]

COMMANDS = {
    "on":         lambda _: pkt_power(True),
    "off":        lambda _: pkt_power(False),
    "color":      lambda a: pkt_color(a.get("r", 255), a.get("g", 0), a.get("b", 0)),
    "brightness": lambda a: pkt_brightness(a.get("level", 100)),
    "pattern":    lambda a: pkt_pattern(a.get("index", 1)),
    "color_temp": lambda a: pkt_color_temp(a.get("level", 50)),
    "mic":        lambda a: pkt_mic_eq(a.get("mode", 1)),
    "mic_off":    lambda _: pkt_mic_eq(0),
    "red":        lambda _: pkt_color(255, 0, 0),
    "green":      lambda _: pkt_color(0, 255, 0),
    "blue":       lambda _: pkt_color(0, 0, 255),
    "white":      lambda _: pkt_color(255, 255, 255),
    "purple":     lambda _: pkt_color(128, 0, 255),
    "cyan":       lambda _: pkt_color(0, 255, 255),
    "yellow":     lambda _: pkt_color(255, 255, 0),
    "orange":     lambda _: pkt_color(255, 165, 0),
    "pink":       lambda _: pkt_color(255, 105, 180),
    "warm":       lambda _: pkt_color(255, 180, 100),
    "magenta":    lambda _: pkt_color(255, 0, 255),
}


async def connect(address):
    """Find and connect to the LED strip with retry"""
    for attempt in range(3):
        device = await find_strip(address)
        if not device:
            if attempt < 2:
                continue
            print(f"Device {address} not found")
            return None
        try:
            client = BleakClient(device, timeout=15.0)
            await client.connect(dangerous_use_bleak_cache=True)
            if client.is_connected:
                return client
        except Exception as e:
            if attempt < 2:
                await asyncio.sleep(1)
                continue
            print(f"Connection failed: {e}")
    return None


async def scan():
    """Scan for BLE LED strips"""
    print("Scanning for BLE LED strips...")
    discovery = await BleakScanner.discover(timeout=10, return_adv=True)
    found = []
    for _addr, (d, adv) in discovery.items():
        name = d.name or adv.local_name or ""
        rssi = adv.rssi
        is_led = any(n.lower() in name.lower() for n in LED_NAMES)
        if is_led:
            found.append({"name": name, "address": d.address, "rssi": rssi})
            print(f"  FOUND: {name} [{d.address}] RSSI:{rssi}")
    if not found:
        print("\nNo LED strips found. All nearby devices:")
        all_devs = [(d, adv) for _addr, (d, adv) in discovery.items()]
        for d, adv in sorted(all_devs, key=lambda x: x[1].rssi or -100, reverse=True)[:15]:
            name = d.name or adv.local_name or "(unknown)"
            print(f"  {name} [{d.address}] RSSI:{adv.rssi}")
    return found


async def send_command(address, cmd_name, args=None):
    """Send a single command"""
    if cmd_name not in COMMANDS:
        print(f"Unknown command: {cmd_name}")
        print(f"Available: {', '.join(COMMANDS.keys())}")
        return False
    packet = COMMANDS[cmd_name](args or {})
    client = await connect(address)
    if not client:
        return False
    try:
        await client.write_gatt_char(CHAR_UUID, packet, response=False)
        print(f"OK: {cmd_name} -> {packet.hex(' ')}")
        return True
    finally:
        await client.disconnect()


async def rainbow(address, loops=3, delay=0.3):
    """Rainbow color cycle"""
    colors = [
        (255,0,0), (255,127,0), (255,255,0), (0,255,0),
        (0,255,255), (0,0,255), (128,0,255), (255,0,255),
    ]
    client = await connect(address)
    if not client:
        return
    try:
        for _ in range(loops):
            for r, g, b in colors:
                await client.write_gatt_char(CHAR_UUID, pkt_color(r, g, b), response=False)
                await asyncio.sleep(delay)
        print("Rainbow complete")
    finally:
        await client.disconnect()


async def pulse(address, r=255, g=0, b=0, loops=3, delay=0.05):
    """Pulse brightness"""
    client = await connect(address)
    if not client:
        return
    try:
        await client.write_gatt_char(CHAR_UUID, pkt_color(r, g, b), response=False)
        for _ in range(loops):
            for bri in list(range(5, 101, 5)) + list(range(100, 4, -5)):
                await client.write_gatt_char(CHAR_UUID, pkt_brightness(bri), response=False)
                await asyncio.sleep(delay)
        print("Pulse complete")
    finally:
        await client.disconnect()


async def wave(address, loops=2, delay=0.08):
    """Smooth color wave"""
    client = await connect(address)
    if not client:
        return
    try:
        for _ in range(loops):
            for i in range(60):
                t = i / 60 * 6
                if t < 1:   r, g, b = 255, int(255*t), 0
                elif t < 2: r, g, b = int(255*(2-t)), 255, 0
                elif t < 3: r, g, b = 0, 255, int(255*(t-2))
                elif t < 4: r, g, b = 0, int(255*(4-t)), 255
                elif t < 5: r, g, b = int(255*(t-4)), 0, 255
                else:        r, g, b = 255, 0, int(255*(6-t))
                await client.write_gatt_char(CHAR_UUID, pkt_color(r, g, b), response=False)
                await asyncio.sleep(delay)
        print("Wave complete")
    finally:
        await client.disconnect()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("LEDDMX Controller (0x7B protocol)")
        print(f"Default: {DEFAULT_ADDRESS}")
        print(f"\nUsage:")
        print(f"  led_strip.py scan")
        print(f"  led_strip.py [addr] <command> [json_args]")
        print(f"  led_strip.py [addr] rainbow|pulse|wave [loops]")
        print(f"  led_strip.py [addr] pattern <index>  (0-210)")
        print(f"\nCommands: {', '.join(COMMANDS.keys())}")
        print(f"\nPatterns (0-{len(PATTERNS)-1}):")
        for i, p in enumerate(PATTERNS[:30]):
            print(f"  {i:3d}: {p}")
        print(f"  ... and {len(PATTERNS)-30} more (up to 210)")
        sys.exit(1)

    if sys.argv[1] == "scan":
        asyncio.run(scan())
    else:
        if ":" in sys.argv[1] and len(sys.argv[1]) == 17:
            addr = sys.argv[1]
            cmd = sys.argv[2] if len(sys.argv) > 2 else "on"
            extra = sys.argv[3:]
        else:
            addr = DEFAULT_ADDRESS
            cmd = sys.argv[1]
            extra = sys.argv[2:]

        if cmd == "rainbow":
            asyncio.run(rainbow(addr, int(extra[0]) if extra else 3))
        elif cmd == "pulse":
            asyncio.run(pulse(addr, loops=int(extra[0]) if extra else 3))
        elif cmd == "wave":
            asyncio.run(wave(addr, loops=int(extra[0]) if extra else 2))
        elif cmd == "pattern":
            idx = int(extra[0]) if extra else 1
            asyncio.run(send_command(addr, "pattern", {"index": idx}))
        else:
            args = json.loads(extra[0]) if extra else {}
            asyncio.run(send_command(addr, cmd, args))
