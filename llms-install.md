# hypr-tools Installation Guide for AI Assistants

## Overview

hypr-tools is an MCP server providing 178 tools for Hyprland desktop automation on Linux/Wayland.

## Installation

```bash
npm install -g github:0aaryan/hypr-tools
```

## MCP Client Configuration

Add to your MCP client config:

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

## Requirements

- Linux with Hyprland compositor (Wayland)
- Node.js >= 18
- Standard Hyprland utilities: hyprctl, pactl, brightnessctl, wl-clipboard, grim, slurp, playerctl, nmcli, bluetoothctl, notify-send

## No API Keys Required

hypr-tools runs entirely locally. No external API keys or cloud services are needed.

## Verification

After installation, the server should output to stderr:
```
hypr-tools MCP server running — 178 tools loaded
```
