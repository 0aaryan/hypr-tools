import { safeExec, ok, err, type ToolModule } from "../utils.js";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

const REC_DIR = resolve(homedir(), "Videos/Recordings");
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const RO = { readOnlyHint: true, openWorldHint: false };

function ensureDir() {
  mkdirSync(REC_DIR, { recursive: true });
}

function filename(ext: string): string {
  const d = new Date();
  return `recording_${d.toISOString().replace(/[:.]/g, "-")}.${ext}`;
}

export const recordingTools: ToolModule = {
  tools: [
    {
      name: "start_recording",
      description: "Start recording the screen to a video file in ~/Videos/Recordings/",
      inputSchema: {
        type: "object",
        properties: {
          audio: { type: "boolean", description: "Include audio (default false)" },
        },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "stop_recording",
      description: "Stop the current screen recording",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
    {
      name: "is_recording",
      description: "Check if a screen recording is currently in progress",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "start_recording_gif",
      description: "Start recording the screen as a GIF file",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: WR,
    },
  ],

  handlers: {
    async start_recording(args) {
      const check = await safeExec("pgrep", ["-x", "wf-recorder"]);
      if (check.stdout) return err("A recording is already in progress");
      ensureDir();
      const f = resolve(REC_DIR, filename("mp4"));
      const cmdArgs = ["-f", f];
      if (args.audio) cmdArgs.push("-a");
      // Start in background - wf-recorder runs until killed
      await safeExec("bash", ["-c", `wf-recorder ${cmdArgs.join(" ")} &`], 3000);
      return ok(`Recording started: ${f}`);
    },
    async stop_recording() {
      const r = await safeExec("pkill", ["-INT", "wf-recorder"]);
      return r.exitCode === 0 ? ok("Recording stopped") : err("No active recording found");
    },
    async is_recording() {
      const r = await safeExec("pgrep", ["-x", "wf-recorder"]);
      return ok(r.stdout ? "Recording in progress" : "Not recording");
    },
    async start_recording_gif() {
      const check = await safeExec("pgrep", ["-x", "wf-recorder"]);
      if (check.stdout) return err("A recording is already in progress");
      ensureDir();
      const f = resolve(REC_DIR, filename("gif"));
      await safeExec("bash", ["-c", `wf-recorder -c gif -f ${f} &`], 3000);
      return ok(`GIF recording started: ${f}`);
    },
  },
};
