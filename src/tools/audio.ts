import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const audioTools: ToolModule = {
  tools: [
    {
      name: "get_volume",
      description: "Get current audio output volume percentage and mute state",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_volume",
      description: "Set audio output volume to a specific percentage (0-150)",
      inputSchema: {
        type: "object",
        properties: { volume: { type: "number", description: "Volume percentage (0-150)" } },
        required: ["volume"],
      },
      annotations: WR,
    },
    {
      name: "increase_volume",
      description: "Increase audio output volume by N percent (default 5)",
      inputSchema: {
        type: "object",
        properties: { step: { type: "number", description: "Percentage to increase by (default 5)" } },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "decrease_volume",
      description: "Decrease audio output volume by N percent (default 5)",
      inputSchema: {
        type: "object",
        properties: { step: { type: "number", description: "Percentage to decrease by (default 5)" } },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "toggle_mute",
      description: "Toggle audio output mute on/off",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "get_mic_volume",
      description: "Get microphone input volume percentage and mute state",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_mic_volume",
      description: "Set microphone input volume to a specific percentage (0-100)",
      inputSchema: {
        type: "object",
        properties: { volume: { type: "number", description: "Mic volume percentage (0-100)" } },
        required: ["volume"],
      },
      annotations: WR,
    },
    {
      name: "toggle_mic_mute",
      description: "Toggle microphone mute on/off",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "list_audio_sinks",
      description: "List all audio output devices (speakers, headphones, etc.)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_default_sink",
      description: "Set the default audio output device by name or ID",
      inputSchema: {
        type: "object",
        properties: { sink: { type: "string", description: "Sink name or numeric ID" } },
        required: ["sink"],
      },
      annotations: WR,
    },
    {
      name: "list_audio_sources",
      description: "List all audio input devices (microphones)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "set_default_source",
      description: "Set the default audio input device by name or ID",
      inputSchema: {
        type: "object",
        properties: { source: { type: "string", description: "Source name or numeric ID" } },
        required: ["source"],
      },
      annotations: WR,
    },
  ],

  handlers: {
    async get_volume() {
      const vol = await safeExec("pamixer", ["--get-volume"]);
      const mute = await safeExec("pamixer", ["--get-mute"]);
      return ok(`Volume: ${vol.stdout}%\nMuted: ${mute.stdout}`);
    },
    async set_volume(args) {
      const v = Math.max(0, Math.min(150, args.volume));
      await safeExec("pamixer", ["--set-volume", String(v)]);
      return ok(`Volume set to ${v}%`);
    },
    async increase_volume(args) {
      const step = args.step ?? 5;
      await safeExec("pamixer", ["-i", String(step)]);
      const vol = await safeExec("pamixer", ["--get-volume"]);
      return ok(`Volume increased by ${step}% → now ${vol.stdout}%`);
    },
    async decrease_volume(args) {
      const step = args.step ?? 5;
      await safeExec("pamixer", ["-d", String(step)]);
      const vol = await safeExec("pamixer", ["--get-volume"]);
      return ok(`Volume decreased by ${step}% → now ${vol.stdout}%`);
    },
    async toggle_mute() {
      await safeExec("pamixer", ["-t"]);
      const mute = await safeExec("pamixer", ["--get-mute"]);
      return ok(`Mute toggled → ${mute.stdout === "true" ? "muted" : "unmuted"}`);
    },
    async get_mic_volume() {
      const vol = await safeExec("pamixer", ["--default-source", "--get-volume"]);
      const mute = await safeExec("pamixer", ["--default-source", "--get-mute"]);
      return ok(`Mic Volume: ${vol.stdout}%\nMic Muted: ${mute.stdout}`);
    },
    async set_mic_volume(args) {
      const v = Math.max(0, Math.min(100, args.volume));
      await safeExec("pamixer", ["--default-source", "--set-volume", String(v)]);
      return ok(`Mic volume set to ${v}%`);
    },
    async toggle_mic_mute() {
      await safeExec("pamixer", ["--default-source", "-t"]);
      const mute = await safeExec("pamixer", ["--default-source", "--get-mute"]);
      return ok(`Mic mute toggled → ${mute.stdout === "true" ? "muted" : "unmuted"}`);
    },
    async list_audio_sinks() {
      const r = await safeExec("pactl", ["list", "sinks", "short"]);
      return ok(r.stdout || "No sinks found");
    },
    async set_default_sink(args) {
      await safeExec("pactl", ["set-default-sink", args.sink]);
      return ok(`Default sink set to: ${args.sink}`);
    },
    async list_audio_sources() {
      const r = await safeExec("pactl", ["list", "sources", "short"]);
      return ok(r.stdout || "No sources found");
    },
    async set_default_source(args) {
      await safeExec("pactl", ["set-default-source", args.source]);
      return ok(`Default source set to: ${args.source}`);
    },
  },
};
