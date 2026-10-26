#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolDef, ToolHandler } from "./utils.js";

// Import all tool modules
import { audioTools } from "./tools/audio.js";
import { brightnessTools } from "./tools/brightness.js";
import { clipboardTools } from "./tools/clipboard.js";
import { screenshotTools } from "./tools/screenshot.js";
import { recordingTools } from "./tools/recording.js";
import { wallpaperTools } from "./tools/wallpaper.js";
import { themeTools } from "./tools/theme.js";
import { notificationTools } from "./tools/notifications.js";
import { windowTools } from "./tools/windows.js";
import { workspaceTools } from "./tools/workspaces.js";
import { monitorTools } from "./tools/monitors.js";
import { keyboardTools } from "./tools/keyboard.js";
import { mediaTools } from "./tools/media.js";
import { networkTools } from "./tools/network.js";
import { bluetoothTools } from "./tools/bluetooth.js";
import { systemTools } from "./tools/system.js";
import { packageTools } from "./tools/packages.js";
import { appTools } from "./tools/apps.js";
import { waybarTools } from "./tools/waybar.js";
import { hyprlandTools } from "./tools/hyprland.js";
import { sessionTools } from "./tools/session.js";
import { colorPickerTools } from "./tools/colorpicker.js";
import { fileTools } from "./tools/files.js";

// New modules — Tier 0 + Tier 1
import { whatsappTools } from "./tools/whatsapp.js";
import { ledTools } from "./tools/led.js";
import { timerTools } from "./tools/timer.js";
import { quickTools } from "./tools/quick.js";
import { powerTools } from "./tools/power.js";
import { macroTools, setMacroHandlerLookup } from "./tools/macro.js";
import { projectorTools } from "./tools/projector.js";

// Collect all tools and handlers
const allModules = [
  audioTools,
  brightnessTools,
  clipboardTools,
  screenshotTools,
  recordingTools,
  wallpaperTools,
  themeTools,
  notificationTools,
  windowTools,
  workspaceTools,
  monitorTools,
  keyboardTools,
  mediaTools,
  networkTools,
  bluetoothTools,
  systemTools,
  packageTools,
  appTools,
  waybarTools,
  hyprlandTools,
  sessionTools,
  colorPickerTools,
  fileTools,
  // Tier 0
  whatsappTools,
  ledTools,
  timerTools,
  quickTools,
  powerTools,
  // Tier 1
  macroTools,
  // Tier 2
  projectorTools,
];

const allTools: ToolDef[] = [];
const allHandlers = new Map<string, ToolHandler>();

for (const mod of allModules) {
  for (const tool of mod.tools) {
    allTools.push(tool);
  }
  for (const [name, handler] of Object.entries(mod.handlers)) {
    allHandlers.set(name, handler);
  }
}

// Wire up macro engine — it needs access to all handlers to execute macros
setMacroHandlerLookup((name) => allHandlers.get(name));

// Create server
const server = new Server(
  { name: "hypr-tools", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// List all tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools,
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = allHandlers.get(name);
  if (!handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
  try {
    return await handler(args ?? {});
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error in ${name}: ${error.message}` }],
    };
  }
});

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`hypr-tools MCP server running — ${allTools.length} tools loaded`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
