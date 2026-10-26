import { safeExec, ok, err, type ToolModule } from "../utils.js";

const RO = { readOnlyHint: true, openWorldHint: false };

export const packageTools: ToolModule = {
  tools: [
    {
      name: "check_updates",
      description: "Check for available system updates (pacman official + AUR)",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "search_package",
      description: "Search for a package by name in official repos and AUR",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Package name or search term" } },
        required: ["query"],
      },
      annotations: RO,
    },
    {
      name: "list_installed_packages",
      description: "List explicitly installed packages, optionally filtered by name",
      inputSchema: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Filter by package name substring (optional)" },
          limit: { type: "number", description: "Max results (default 50)" },
        },
        required: [],
      },
      annotations: RO,
    },
  ],

  handlers: {
    async check_updates() {
      const official = await safeExec("checkupdates", [], 30000);
      const officialCount = official.stdout ? official.stdout.split("\n").length : 0;
      // Try yay, fall back to paru, fall back to none
      let aurCount = 0;
      let aurList = "";
      const yay = await safeExec("yay", ["-Qua"], 15000);
      if (yay.exitCode === 0) {
        aurList = yay.stdout;
        aurCount = aurList ? aurList.split("\n").length : 0;
      } else {
        const paru = await safeExec("paru", ["-Qua"], 15000);
        if (paru.exitCode === 0) {
          aurList = paru.stdout;
          aurCount = aurList ? aurList.split("\n").length : 0;
        }
      }
      let out = `Official updates: ${officialCount}`;
      if (official.stdout) out += `\n${official.stdout}`;
      out += `\n\nAUR updates: ${aurCount}`;
      if (aurList) out += `\n${aurList}`;
      return ok(out);
    },
    async search_package(args) {
      const r = await safeExec("pacman", ["-Ss", args.query], 10000);
      return ok(r.stdout || `No packages found for: ${args.query}`);
    },
    async list_installed_packages(args) {
      const r = await safeExec("pacman", ["-Qe"]);
      let lines = r.stdout.split("\n");
      if (args.filter) {
        lines = lines.filter(l => l.toLowerCase().includes(args.filter.toLowerCase()));
      }
      lines = lines.slice(0, args.limit ?? 50);
      return ok(lines.join("\n") || "No packages found");
    },
  },
};
