import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const mediaTools: ToolModule = {
  tools: [
    {
      name: "get_media_status",
      description: "Get currently playing track info: title, artist, album, player, status, position",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "media_play_pause",
      description: "Toggle play/pause on the active media player",
      inputSchema: {
        type: "object",
        properties: { player: { type: "string", description: "Specific player name (optional)" } },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "media_next",
      description: "Skip to the next track",
      inputSchema: {
        type: "object",
        properties: { player: { type: "string", description: "Specific player name (optional)" } },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "media_previous",
      description: "Go to the previous track",
      inputSchema: {
        type: "object",
        properties: { player: { type: "string", description: "Specific player name (optional)" } },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "media_stop",
      description: "Stop media playback",
      inputSchema: {
        type: "object",
        properties: { player: { type: "string", description: "Specific player name (optional)" } },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "media_seek",
      description: "Seek to a position in the current track (in seconds)",
      inputSchema: {
        type: "object",
        properties: {
          position: { type: "number", description: "Position in seconds (use +N or -N for relative seek)" },
          player: { type: "string", description: "Specific player name (optional)" },
        },
        required: ["position"],
      },
      annotations: WR,
    },
    {
      name: "list_media_players",
      description: "List all active MPRIS2 media players",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
  ],

  handlers: {
    async get_media_status() {
      const status = await safeExec("playerctl", ["status"]);
      if (status.exitCode !== 0) return ok("No media player active");
      const meta = await safeExec("playerctl", ["metadata", "--format", "Player: {{playerName}}\nStatus: {{status}}\nTitle: {{title}}\nArtist: {{artist}}\nAlbum: {{album}}\nPosition: {{duration(position)}}/{{duration(mpris:length)}}"]);
      return ok(meta.stdout || "No media info");
    },
    async media_play_pause(args) {
      const a = args.player ? ["-p", args.player, "play-pause"] : ["play-pause"];
      await safeExec("playerctl", a);
      return ok("Play/pause toggled");
    },
    async media_next(args) {
      const a = args.player ? ["-p", args.player, "next"] : ["next"];
      await safeExec("playerctl", a);
      return ok("Skipped to next track");
    },
    async media_previous(args) {
      const a = args.player ? ["-p", args.player, "previous"] : ["previous"];
      await safeExec("playerctl", a);
      return ok("Went to previous track");
    },
    async media_stop(args) {
      const a = args.player ? ["-p", args.player, "stop"] : ["stop"];
      await safeExec("playerctl", a);
      return ok("Playback stopped");
    },
    async media_seek(args) {
      const pos = String(args.position);
      const a = args.player ? ["-p", args.player, "position", pos] : ["position", pos];
      await safeExec("playerctl", a);
      return ok(`Seeked to ${pos}s`);
    },
    async list_media_players() {
      const r = await safeExec("playerctl", ["-l"]);
      return ok(r.stdout || "No active media players");
    },
  },
};
