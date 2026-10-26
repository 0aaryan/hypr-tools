import { safeExec, ok, err, type ToolModule } from "../utils.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const TIMER_DIR = "/tmp/hypr-timers";
const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DES = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

interface TimerEntry {
  id: string;
  label: string;
  pid: number;
  started: string;
  seconds: number;
  fires_at: string;
}

function ensureDir() {
  if (!existsSync(TIMER_DIR)) {
    mkdirSync(TIMER_DIR, { recursive: true });
  }
}

function loadTimers(): TimerEntry[] {
  const file = `${TIMER_DIR}/timers.json`;
  if (!existsSync(file)) return [];
  try {
    const entries: TimerEntry[] = JSON.parse(readFileSync(file, "utf-8"));
    // Prune dead timers (PID no longer exists)
    const alive = entries.filter((t) => {
      try {
        process.kill(t.pid, 0);
        return true;
      } catch {
        return false;
      }
    });
    if (alive.length !== entries.length) saveTimers(alive);
    return alive;
  } catch {
    return [];
  }
}

function saveTimers(timers: TimerEntry[]) {
  ensureDir();
  writeFileSync(`${TIMER_DIR}/timers.json`, JSON.stringify(timers, null, 2));
}

export const timerTools: ToolModule = {
  tools: [
    {
      name: "set_timer",
      description:
        "Set a countdown timer. Sends a desktop notification when it fires.",
      inputSchema: {
        type: "object",
        properties: {
          seconds: { type: "number", description: "Timer duration in seconds" },
          minutes: {
            type: "number",
            description: "Timer duration in minutes (converted to seconds)",
          },
          label: {
            type: "string",
            description: "Timer label (default: 'Timer')",
          },
        },
        required: [],
      },
      annotations: WR,
    },
    {
      name: "list_timers",
      description: "List all active timers with their remaining time",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "cancel_timer",
      description: "Cancel an active timer by its ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Timer ID to cancel" },
        },
        required: ["id"],
      },
      annotations: DES,
    },
    {
      name: "cancel_all_timers",
      description: "Cancel all active timers",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: DES,
    },
  ],

  handlers: {
    async set_timer(args) {
      let secs = args.seconds ?? 0;
      if (args.minutes) secs += args.minutes * 60;
      if (secs <= 0) return err("Provide seconds or minutes > 0");

      const label = args.label || "Timer";
      const id = `t${Date.now().toString(36)}`;
      const firesAt = new Date(Date.now() + secs * 1000).toISOString();

      // Launch background process: sleep then notify
      const r = await safeExec(
        "bash",
        [
          "-c",
          `(sleep ${secs} && notify-send -a "Timer" -u normal -t 10000 "⏰ ${label}" "Timer finished (${secs}s)" && paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null) &
echo $!`,
        ],
        5000
      );

      const pid = parseInt(r.stdout.trim());
      if (isNaN(pid)) return err("Failed to start timer process");

      ensureDir();
      const timers = loadTimers();
      timers.push({
        id,
        label,
        pid,
        started: new Date().toISOString(),
        seconds: secs,
        fires_at: firesAt,
      });
      saveTimers(timers);

      const display =
        secs >= 60
          ? `${Math.floor(secs / 60)}m ${secs % 60}s`
          : `${secs}s`;
      return ok(`Timer "${label}" set for ${display} (ID: ${id}, fires at ${firesAt})`);
    },

    async list_timers() {
      const timers = loadTimers();
      if (timers.length === 0) return ok("No active timers");

      const now = Date.now();
      const lines = timers.map((t) => {
        const remaining = Math.max(
          0,
          Math.round((new Date(t.fires_at).getTime() - now) / 1000)
        );
        const display =
          remaining >= 60
            ? `${Math.floor(remaining / 60)}m ${remaining % 60}s`
            : `${remaining}s`;
        return `[${t.id}] "${t.label}" — ${display} remaining (fires at ${t.fires_at})`;
      });
      return ok(lines.join("\n"));
    },

    async cancel_timer(args) {
      const timers = loadTimers();
      const idx = timers.findIndex((t) => t.id === args.id);
      if (idx === -1) return err(`Timer "${args.id}" not found`);

      const timer = timers[idx];
      try {
        process.kill(timer.pid, "SIGTERM");
      } catch {
        // already dead
      }
      timers.splice(idx, 1);
      saveTimers(timers);
      return ok(`Timer "${timer.label}" (${args.id}) cancelled`);
    },

    async cancel_all_timers() {
      const timers = loadTimers();
      if (timers.length === 0) return ok("No active timers to cancel");

      for (const t of timers) {
        try {
          process.kill(t.pid, "SIGTERM");
        } catch {
          // already dead
        }
      }
      saveTimers([]);
      return ok(`Cancelled ${timers.length} timer(s)`);
    },
  },
};
