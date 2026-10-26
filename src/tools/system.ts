import { safeExec, ok, err, type ToolModule } from "../utils.js";
import { readFileSync } from "node:fs";

const RO = { readOnlyHint: true, openWorldHint: false };

export const systemTools: ToolModule = {
  tools: [
    {
      name: "get_cpu_info",
      description: "Get CPU model, usage percentage, temperature, and frequency",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_gpu_info",
      description: "Get GPU model, usage, temperature, and VRAM usage",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_memory_info",
      description: "Get RAM usage: used, total, available, swap",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_disk_info",
      description: "Get disk usage per mount point",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_battery_info",
      description: "Get battery percentage, charging state, and time remaining",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_uptime",
      description: "Get system uptime and load averages",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_system_info",
      description: "Get OS, kernel version, hostname, Hyprland version, and shell",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "list_processes",
      description: "List running processes, optionally filtered and sorted by CPU or memory usage",
      inputSchema: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Filter by process name substring (optional)" },
          sort: { type: "string", enum: ["cpu", "mem"], description: "Sort by cpu or mem (default cpu)" },
          limit: { type: "number", description: "Max number of processes (default 20)" },
        },
        required: [],
      },
      annotations: RO,
    },
  ],

  handlers: {
    async get_cpu_info() {
      const model = await safeExec("bash", ["-c", "lscpu | grep 'Model name' | sed 's/Model name:\\s*//' | head -1"]);
      const usage = await safeExec("bash", ["-c", "top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}'"]);
      const temp = await safeExec("bash", ["-c", "sensors 2>/dev/null | grep -m1 'Package\\|Tctl\\|CPU' | awk '{print $NF}'"]);
      const freq = await safeExec("bash", ["-c", "lscpu | grep 'CPU MHz' | head -1 | awk '{print $NF}'"]);
      return ok(`CPU: ${model.stdout}\nUsage: ${usage.stdout}%\nTemp: ${temp.stdout || "N/A"}\nFreq: ${freq.stdout ? freq.stdout + " MHz" : "N/A"}`);
    },
    async get_gpu_info() {
      // Try nvidia first, then AMD
      const nvidia = await safeExec("nvidia-smi", ["--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"]);
      if (nvidia.exitCode === 0 && nvidia.stdout) {
        const [name, util, temp, memUsed, memTotal] = nvidia.stdout.split(",").map(s => s.trim());
        return ok(`GPU: ${name}\nUsage: ${util}%\nTemp: ${temp}C\nVRAM: ${memUsed}/${memTotal} MiB`);
      }
      // AMD fallback
      const amd = await safeExec("bash", ["-c", "cat /sys/class/drm/card*/device/gpu_busy_percent 2>/dev/null | head -1"]);
      const amdTemp = await safeExec("bash", ["-c", "sensors 2>/dev/null | grep -A2 'amdgpu' | grep temp | head -1 | awk '{print $2}'"]);
      const amdName = await safeExec("bash", ["-c", "lspci | grep -i 'vga\\|3d' | head -1 | sed 's/.*: //'"]);
      return ok(`GPU: ${amdName.stdout || "Unknown"}\nUsage: ${amd.stdout || "N/A"}%\nTemp: ${amdTemp.stdout || "N/A"}`);
    },
    async get_memory_info() {
      const r = await safeExec("free", ["-h"]);
      return ok(r.stdout);
    },
    async get_disk_info() {
      const r = await safeExec("df", ["-h", "--output=target,size,used,avail,pcent", "-x", "tmpfs", "-x", "devtmpfs", "-x", "efivarfs"]);
      return ok(r.stdout);
    },
    async get_battery_info() {
      const r = await safeExec("upower", ["-i", "/org/freedesktop/UPower/devices/battery_BAT0"]);
      if (r.stdout) {
        const pct = r.stdout.match(/percentage:\s+(.+)/)?.[1] ?? "N/A";
        const state = r.stdout.match(/state:\s+(.+)/)?.[1] ?? "N/A";
        const time = r.stdout.match(/time to (?:empty|full):\s+(.+)/)?.[1] ?? "N/A";
        return ok(`Battery: ${pct}\nState: ${state}\nTime remaining: ${time}`);
      }
      // Fallback to /sys
      try {
        const cap = readFileSync("/sys/class/power_supply/BAT0/capacity", "utf-8").trim();
        const status = readFileSync("/sys/class/power_supply/BAT0/status", "utf-8").trim();
        return ok(`Battery: ${cap}%\nState: ${status}`);
      } catch {
        return ok("No battery detected");
      }
    },
    async get_uptime() {
      const r = await safeExec("uptime", ["-p"]);
      const load = await safeExec("bash", ["-c", "cat /proc/loadavg"]);
      return ok(`${r.stdout}\nLoad: ${load.stdout}`);
    },
    async get_system_info() {
      const kernel = await safeExec("uname", ["-r"]);
      const hostname = await safeExec("hostname", []);
      const hypr = await safeExec("hyprctl", ["version"]);
      const os = await safeExec("bash", ["-c", "grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"'"]);
      const shell = await safeExec("bash", ["-c", "echo $SHELL"]);
      return ok(`OS: ${os.stdout}\nKernel: ${kernel.stdout}\nHostname: ${hostname.stdout}\nShell: ${shell.stdout}\nHyprland:\n${hypr.stdout}`);
    },
    async list_processes(args) {
      const sort = args.sort === "mem" ? "--sort=-%mem" : "--sort=-%cpu";
      const limit = args.limit ?? 20;
      const r = await safeExec("ps", ["aux", sort]);
      let lines = r.stdout.split("\n");
      const header = lines[0];
      lines = lines.slice(1);
      if (args.filter) {
        lines = lines.filter(l => l.toLowerCase().includes(args.filter.toLowerCase()));
      }
      lines = lines.slice(0, limit);
      return ok(`${header}\n${lines.join("\n")}`);
    },
  },
};
