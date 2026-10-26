# hypr-tools

**The most comprehensive MCP server for Linux desktop automation -- 178 tools across 30 categories**

Give your AI assistant full control over your Hyprland/Wayland desktop: audio, windows, themes, screenshots, Bluetooth, media, macros, RGB lighting, projectors, and more.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

---

## Why hypr-tools?

- **178 tools, 30 categories** -- the largest Hyprland MCP server available
- **Zero config** -- `npx -y github:0aaryan/hypr-tools` and you're running
- **No cloud dependencies** -- everything runs locally via `hyprctl`, PipeWire, and standard Linux tools
- **Macro engine** -- chain any tools into reusable multi-step automations
- **Works with every MCP client** -- Claude Desktop, Claude Code, Cursor, Cline, Windsurf, and more

## What can it do?

Ask your AI to:
- "Turn my volume down to 30%"
- "Switch to the dark theme and change my wallpaper"
- "Take a screenshot of my current window"
- "Connect to my Bluetooth headphones"
- "Move Firefox to workspace 3"
- "Create a macro that dims lights and enables DND"
- "Set my keyboard LEDs to red"
- "Show my CPU and GPU stats"

---

## Quick Start

### Install

```bash
npm install -g github:0aaryan/hypr-tools
```

Or run directly:

```bash
npx -y github:0aaryan/hypr-tools
```

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hypr-tools": {
      "command": "npx",
      "args": ["-y", "github:0aaryan/hypr-tools"]
    }
  }
}
```

### Claude Code (CLI)

Add to your project or global settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "hypr-tools": {
      "command": "npx",
      "args": ["-y", "github:0aaryan/hypr-tools"]
    }
  }
}
```

### Cursor / Windsurf

Add to your editor's MCP settings:

```json
{
  "mcpServers": {
    "hypr-tools": {
      "command": "npx",
      "args": ["-y", "github:0aaryan/hypr-tools"]
    }
  }
}
```

### Cline

Add to your Cline MCP config:

```json
{
  "mcpServers": {
    "hypr-tools": {
      "command": "npx",
      "args": ["-y", "github:0aaryan/hypr-tools"]
    }
  }
}
```

### From Source

```bash
git clone https://github.com/0aaryan/hypr-tools.git
cd hypr-tools
npm install
npm run build
node build/index.js
```

---

## Requirements

- **Hyprland** compositor (Wayland)
- **Linux** (Arch, NixOS, Fedora, etc.)
- **Node.js** >= 18
- System utilities (most come pre-installed with Hyprland):
  - `pactl` (PulseAudio/PipeWire) -- audio
  - `brightnessctl` -- brightness
  - `wl-clipboard` -- clipboard
  - `grim` + `slurp` -- screenshots
  - `wf-recorder` -- screen recording
  - `hyprctl` -- Hyprland IPC
  - `nmcli` -- network
  - `bluetoothctl` -- Bluetooth
  - `playerctl` -- media
  - `notify-send` -- notifications

---

## Configuration

Everything works out of the box. A few optional tools need hardware or extra setup:

| Tools | What they need |
|-------|----------------|
| `led_*` | A BLE LED strip (LEDDMX / ELK-BLEDOM family) and `pip install bleak`. Set `HYPR_LED_ADDRESS` to its MAC, or leave it unset and the strip is found by name. |
| `projector_*` | An Android projector with ADB over Wi-Fi, optionally Fully Kiosk Browser. Run `projector_setup` once; settings are saved in `~/.config/hypr-tools/projector.json`. |
| `wa_*` | WhatsApp Web open in Firefox with a local bridge extension. Set `FIREFOX_BRIDGE_URL` if it isn't on `http://localhost:7866`. |
| theme, wallpaper, wallbash | [HyDE](https://github.com/HyDE-Project/HyDE). On other Hyprland setups these tools return an error. |
| voice scripts | `src/tools/voice_*` are optional push-to-talk and TTS helpers for Claude Code. They use a Python venv at `./voice-venv`, or set `HYPR_TOOLS_VENV`. |

---

## Tool Categories (178 tools)

<details>
<summary><strong>Audio (12 tools)</strong> -- Volume, sinks, sources, microphone</summary>

| Tool | Description |
|------|-------------|
| `get_volume` | Get current audio output volume and mute state |
| `set_volume` | Set audio output volume (0-150%) |
| `increase_volume` | Increase volume by N percent |
| `decrease_volume` | Decrease volume by N percent |
| `toggle_mute` | Toggle audio output mute |
| `get_mic_volume` | Get microphone volume and mute state |
| `set_mic_volume` | Set microphone volume |
| `toggle_mic_mute` | Toggle microphone mute |
| `list_audio_sinks` | List all audio output devices |
| `set_default_sink` | Set default audio output device |
| `list_audio_sources` | List all audio input devices |
| `set_default_source` | Set default audio input device |

</details>

<details>
<summary><strong>Windows (14 tools)</strong> -- Focus, move, resize, pin, float, fullscreen</summary>

| Tool | Description |
|------|-------------|
| `list_windows` | List all open windows with details |
| `get_focused_window` | Get the currently focused window |
| `focus_window` | Focus a window by class or title |
| `close_window` | Gracefully close a window |
| `kill_window` | Force kill a window |
| `toggle_float` | Toggle floating mode |
| `toggle_fullscreen` | Toggle fullscreen mode |
| `pin_window` | Pin window on all workspaces |
| `move_window_to_workspace` | Move window to a workspace |
| `resize_window` | Resize a window |
| `move_window` | Move a window |
| `toggle_split` | Toggle split direction |
| `group_window` | Group/ungroup window |
| `move_to_scratchpad` | Move window to scratchpad |

</details>

<details>
<summary><strong>Projector (12 tools)</strong> -- ADB projector/tablet control</summary>

| Tool | Description |
|------|-------------|
| `projector_setup` | Configure projector IP and credentials |
| `projector_status` | Get projector status |
| `projector_open_url` | Open a URL on the projector |
| `projector_show_dashboard` | Show dashboard on projector |
| `projector_wake` | Wake up the projector |
| `projector_sleep` | Put projector to sleep |
| `projector_fullscreen` | Toggle fullscreen on projector |
| `projector_brightness` | Set projector brightness |
| `projector_reload` | Reload current page |
| `projector_screenshot` | Take a screenshot on projector |
| `projector_speak` | Text-to-speech on projector |
| `projector_scan` | Scan for projectors on network |

</details>

<details>
<summary><strong>Theme (9 tools)</strong> -- Theme switching, wallbash, rofi styles</summary>

| Tool | Description |
|------|-------------|
| `get_current_theme` | Get the active theme |
| `set_theme` | Set a theme by name |
| `next_theme` | Switch to next theme |
| `prev_theme` | Switch to previous theme |
| `list_themes` | List all available themes |
| `get_wallbash_mode` | Get wallbash color mode |
| `set_wallbash_mode` | Set wallbash color mode |
| `get_rofi_style` | Get current rofi style |
| `set_rofi_style` | Set rofi launcher style |

</details>

<details>
<summary><strong>System (8 tools)</strong> -- CPU, GPU, RAM, disk, battery, processes</summary>

| Tool | Description |
|------|-------------|
| `get_cpu_info` | CPU usage and details |
| `get_gpu_info` | GPU information |
| `get_memory_info` | RAM usage |
| `get_disk_info` | Disk usage |
| `get_battery_info` | Battery status |
| `get_uptime` | System uptime |
| `get_system_info` | Full system overview |
| `list_processes` | List running processes |

</details>

<details>
<summary><strong>Wallpaper (7 tools)</strong> -- Set, cycle, list wallpapers</summary>

| Tool | Description |
|------|-------------|
| `get_wallpaper` | Get current wallpaper path |
| `set_wallpaper` | Set wallpaper by path |
| `next_wallpaper` | Switch to next wallpaper |
| `prev_wallpaper` | Switch to previous wallpaper |
| `list_wallpapers` | List all wallpapers |
| `list_theme_wallpapers` | List wallpapers for a theme |
| `get_wallpaper_colors` | Get dominant wallpaper colors |

</details>

<details>
<summary><strong>Workspaces (7 tools)</strong> -- Switch, create, navigate</summary>

| Tool | Description |
|------|-------------|
| `list_workspaces` | List all workspaces |
| `get_active_workspace` | Get the active workspace |
| `switch_workspace` | Switch to a workspace |
| `move_workspace_to_monitor` | Move workspace to a monitor |
| `create_workspace` | Create a new workspace |
| `next_workspace` | Go to next workspace |
| `prev_workspace` | Go to previous workspace |

</details>

<details>
<summary><strong>Monitors (7 tools)</strong> -- List, scale, DPMS, mirror</summary>

| Tool | Description |
|------|-------------|
| `list_monitors` | List all connected monitors |
| `get_focused_monitor` | Get the focused monitor |
| `set_monitor_dpms` | Turn monitor on/off |
| `enable_monitor` | Enable a monitor |
| `disable_monitor` | Disable a monitor |
| `set_monitor_scale` | Set monitor scale factor |
| `mirror_monitor` | Mirror a monitor |

</details>

<details>
<summary><strong>Media (7 tools)</strong> -- Play/pause, next, previous, seek</summary>

| Tool | Description |
|------|-------------|
| `get_media_status` | Get current media playback status |
| `media_play_pause` | Toggle play/pause |
| `media_next` | Skip to next track |
| `media_previous` | Go to previous track |
| `media_stop` | Stop playback |
| `media_seek` | Seek to position |
| `list_media_players` | List active media players |

</details>

<details>
<summary><strong>Notifications (6 tools)</strong> -- Send, list, clear, DND</summary>

| Tool | Description |
|------|-------------|
| `send_notification` | Send a desktop notification |
| `list_notification_history` | List notification history |
| `close_all_notifications` | Dismiss all notifications |
| `toggle_dnd` | Toggle do-not-disturb |
| `get_dnd_status` | Get DND status |
| `set_notification_paused` | Pause/resume notifications |

</details>

<details>
<summary><strong>Network (6 tools)</strong> -- WiFi, IP, status</summary>

| Tool | Description |
|------|-------------|
| `get_network_status` | Get network connection status |
| `list_wifi_networks` | Scan for WiFi networks |
| `connect_wifi` | Connect to a WiFi network |
| `disconnect_wifi` | Disconnect from WiFi |
| `toggle_wifi` | Toggle WiFi on/off |
| `get_ip_addresses` | Get IP addresses |

</details>

<details>
<summary><strong>Clipboard (6 tools)</strong> -- Copy, paste, history</summary>

| Tool | Description |
|------|-------------|
| `get_clipboard` | Get clipboard contents |
| `set_clipboard` | Set clipboard contents |
| `list_clipboard_history` | List clipboard history |
| `paste_from_history` | Paste from history entry |
| `delete_clipboard_entry` | Delete a history entry |
| `clear_clipboard_history` | Clear all clipboard history |

</details>

<details>
<summary><strong>LED (6 tools)</strong> -- RGB lighting control</summary>

| Tool | Description |
|------|-------------|
| `led_set_color` | Set LED color |
| `led_set_brightness` | Set LED brightness |
| `led_power` | Turn LEDs on/off |
| `led_set_pattern` | Set LED pattern |
| `led_effect` | Apply LED effect |
| `led_scan` | Scan for LED devices |

</details>

<details>
<summary><strong>Screenshots (5 tools)</strong> -- Full, region, window, monitor</summary>

| Tool | Description |
|------|-------------|
| `screenshot_full` | Take full screen screenshot |
| `screenshot_monitor` | Screenshot a specific monitor |
| `screenshot_region` | Screenshot a selected region |
| `screenshot_window` | Screenshot a specific window |
| `screenshot_to_clipboard` | Screenshot directly to clipboard |

</details>

<details>
<summary><strong>Bluetooth (5 tools)</strong> -- Connect, disconnect, list</summary>

| Tool | Description |
|------|-------------|
| `get_bluetooth_status` | Get Bluetooth adapter status |
| `list_bluetooth_devices` | List paired/available devices |
| `connect_bluetooth` | Connect to a device |
| `disconnect_bluetooth` | Disconnect from a device |
| `toggle_bluetooth` | Toggle Bluetooth on/off |

</details>

<details>
<summary><strong>Waybar (5 tools)</strong> -- Bar modes and visibility</summary>

| Tool | Description |
|------|-------------|
| `get_waybar_mode` | Get current waybar mode |
| `set_waybar_mode` | Set waybar mode |
| `next_waybar_mode` | Switch to next mode |
| `prev_waybar_mode` | Switch to previous mode |
| `toggle_waybar` | Toggle waybar visibility |

</details>

<details>
<summary><strong>Hyprland (5 tools)</strong> -- Config, options, binds</summary>

| Tool | Description |
|------|-------------|
| `hypr_reload` | Reload Hyprland config |
| `get_hypr_option` | Get a Hyprland option value |
| `set_hypr_option` | Set a Hyprland option |
| `get_hypr_binds` | List all keybindings |
| `toggle_animations` | Toggle animations on/off |

</details>

<details>
<summary><strong>Session (5 tools)</strong> -- Lock, suspend, gamemode</summary>

| Tool | Description |
|------|-------------|
| `lock_screen` | Lock the screen |
| `toggle_idle_inhibitor` | Toggle idle inhibitor |
| `toggle_gamemode` | Toggle gamemode |
| `get_gamemode_status` | Get gamemode status |
| `suspend_system` | Suspend the system |

</details>

<details>
<summary><strong>Macro (5 tools)</strong> -- Multi-step automation</summary>

| Tool | Description |
|------|-------------|
| `create_macro` | Create a reusable macro from tool steps |
| `run_macro` | Execute a saved macro |
| `list_macros` | List all saved macros |
| `get_macro` | Get macro details |
| `delete_macro` | Delete a macro |

</details>

<details>
<summary><strong>Quick Actions (5 tools)</strong> -- Common shortcuts</summary>

| Tool | Description |
|------|-------------|
| `open_url` | Open a URL in the default browser |
| `open_file_manager` | Open file manager |
| `open_terminal` | Open terminal emulator |
| `trash_file` | Move file to trash |
| `show_desktop` | Minimize all windows |

</details>

<details>
<summary><strong>Brightness (4 tools)</strong> -- Screen brightness</summary>

| Tool | Description |
|------|-------------|
| `get_brightness` | Get current brightness |
| `set_brightness` | Set brightness level |
| `increase_brightness` | Increase brightness |
| `decrease_brightness` | Decrease brightness |

</details>

<details>
<summary><strong>Keyboard (4 tools)</strong> -- Layout, reading mode</summary>

| Tool | Description |
|------|-------------|
| `get_keyboard_layout` | Get current keyboard layout |
| `switch_keyboard_layout` | Switch keyboard layout |
| `start_reading_mode` | Enter reading mode |
| `stop_reading_mode` | Exit reading mode |

</details>

<details>
<summary><strong>Recording (4 tools)</strong> -- Screen recording and GIF</summary>

| Tool | Description |
|------|-------------|
| `start_recording` | Start screen recording |
| `stop_recording` | Stop screen recording |
| `is_recording` | Check if recording is active |
| `start_recording_gif` | Record screen as GIF |

</details>

<details>
<summary><strong>Timer (4 tools)</strong> -- Set, list, cancel timers</summary>

| Tool | Description |
|------|-------------|
| `set_timer` | Set a countdown timer |
| `list_timers` | List active timers |
| `cancel_timer` | Cancel a timer |
| `cancel_all_timers` | Cancel all timers |

</details>

<details>
<summary><strong>Files (4 tools)</strong> -- Read, write, list, info</summary>

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write to a file |
| `list_directory` | List directory contents |
| `file_info` | Get file metadata |

</details>

<details>
<summary><strong>Apps (4 tools)</strong> -- Launch, list, kill</summary>

| Tool | Description |
|------|-------------|
| `launch_app` | Launch a desktop application |
| `list_desktop_apps` | List installed .desktop apps |
| `kill_app` | Kill an application by name |
| `list_running_apps` | List currently running apps |

</details>

<details>
<summary><strong>Power (4 tools)</strong> -- Battery, profiles, thermal</summary>

| Tool | Description |
|------|-------------|
| `get_power_profile` | Get current power profile |
| `set_power_profile` | Set power profile |
| `get_screen_timeout` | Get screen timeout setting |
| `get_thermal_info` | Get thermal/temperature info |

</details>

<details>
<summary><strong>WhatsApp (3 tools)</strong> -- Send, read, list chats</summary>

| Tool | Description |
|------|-------------|
| `wa_send_message` | Send a WhatsApp message |
| `wa_list_chats` | List WhatsApp chats |
| `wa_read_messages` | Read messages from a chat |

</details>

<details>
<summary><strong>Packages (3 tools)</strong> -- Search, list, updates</summary>

| Tool | Description |
|------|-------------|
| `check_updates` | Check for package updates |
| `search_package` | Search for a package |
| `list_installed_packages` | List installed packages |

</details>

<details>
<summary><strong>Color Picker (2 tools)</strong> -- Pick colors from screen</summary>

| Tool | Description |
|------|-------------|
| `pick_color` | Pick a color from the screen |
| `pick_color_to_clipboard` | Pick color and copy to clipboard |

</details>

---

## Macros

hypr-tools includes a macro engine that lets you compose multi-step automations from any tool combination. Example:

```
"Create a macro called 'movie-mode' that:
  1. Sets volume to 80%
  2. Switches to a dark theme
  3. Enables do-not-disturb
  4. Makes the focused window fullscreen"
```

The AI will use `create_macro` to save this, and `run_macro` to execute it later.

---

## Architecture

```
hypr-tools/
  src/
    index.ts          # MCP server entry point
    utils.ts          # Shared helpers (safeExec, hyprctl)
    tools/
      audio.ts        # 12 tools
      windows.ts      # 14 tools
      projector.ts    # 12 tools
      ... (30 modules total)
  build/              # Compiled JS (ships to npm)
  smithery.yaml       # Smithery marketplace config
  PUBLISH_GUIDE.md    # Publishing instructions
```

All tools use `hyprctl` IPC or standard Linux CLI utilities. No external APIs or cloud services required (except WhatsApp which uses a local bridge).

---

## Compatibility

| MCP Client | Status |
|------------|--------|
| Claude Desktop | Tested |
| Claude Code | Tested |
| Cursor | Tested |
| Cline | Tested |
| Windsurf | Compatible |
| Any stdio MCP client | Compatible |

---

## Contributing

Issues and pull requests welcome at [github.com/0aaryan/hypr-tools](https://github.com/0aaryan/hypr-tools).

---

## License

MIT -- see [LICENSE](LICENSE).

---

## Author

**Aryan Arora** ([@0aaryan](https://github.com/0aaryan))

Built for AI-native desktop automation on Hyprland/Wayland.
