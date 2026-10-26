import { expandPath, isUnderHome, ok, err, type ToolModule } from "../utils.js";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const fileTools: ToolModule = {
  tools: [
    {
      name: "read_file",
      description: "Read the contents of a file (sandboxed to home directory). Use for configs, logs, scripts.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path (absolute or ~/relative)" },
          max_lines: { type: "number", description: "Max lines to return (default 200)" },
        },
        required: ["path"],
      },
      annotations: RO,
    },
    {
      name: "write_file",
      description: "Write content to a file (sandboxed to home directory). Creates parent directories if needed.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path (absolute or ~/relative)" },
          content: { type: "string", description: "Full file content to write" },
        },
        required: ["path", "content"],
      },
      annotations: WR,
    },
    {
      name: "list_directory",
      description: "List files and directories at a path (sandboxed to home directory)",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (absolute or ~/relative)" },
          details: { type: "boolean", description: "Include file sizes and modification times (default false)" },
        },
        required: ["path"],
      },
      annotations: RO,
    },
    {
      name: "file_info",
      description: "Get metadata about a file: size, type, modification time",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "File path" } },
        required: ["path"],
      },
      annotations: RO,
    },
  ],

  handlers: {
    async read_file(args) {
      const p = expandPath(args.path);
      if (!isUnderHome(p)) return err("Access denied: path must be within home directory");
      try {
        const content = readFileSync(p, "utf-8");
        const lines = content.split("\n");
        const max = args.max_lines ?? 200;
        const truncated = lines.length > max;
        return ok(
          lines.slice(0, max).join("\n") +
            (truncated ? `\n\n[Truncated: ${max}/${lines.length} lines shown]` : "")
        );
      } catch (e: any) {
        return err(`Failed to read: ${e.message}`);
      }
    },
    async write_file(args) {
      const p = expandPath(args.path);
      if (!isUnderHome(p)) return err("Access denied: path must be within home directory");
      try {
        const dir = p.substring(0, p.lastIndexOf("/"));
        mkdirSync(dir, { recursive: true });
        writeFileSync(p, args.content, "utf-8");
        return ok(`Written ${args.content.length} bytes to ${p}`);
      } catch (e: any) {
        return err(`Failed to write: ${e.message}`);
      }
    },
    async list_directory(args) {
      const p = expandPath(args.path);
      if (!isUnderHome(p)) return err("Access denied: path must be within home directory");
      try {
        const entries = readdirSync(p, { withFileTypes: true });
        if (args.details) {
          const lines = entries.map((e) => {
            try {
              const s = statSync(`${p}/${e.name}`);
              const type = e.isDirectory() ? "dir" : "file";
              const size = e.isDirectory() ? "-" : `${s.size}B`;
              const mod = s.mtime.toISOString().slice(0, 16);
              return `${type}\t${size}\t${mod}\t${e.name}`;
            } catch {
              return `?\t?\t?\t${e.name}`;
            }
          });
          return ok(`type\tsize\tmodified\tname\n${lines.join("\n")}`);
        }
        const lines = entries.map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`);
        return ok(lines.join("\n") || "(empty directory)");
      } catch (e: any) {
        return err(`Failed to list: ${e.message}`);
      }
    },
    async file_info(args) {
      const p = expandPath(args.path);
      if (!isUnderHome(p)) return err("Access denied: path must be within home directory");
      try {
        const s = statSync(p);
        return ok(`Path: ${p}\nType: ${s.isDirectory() ? "directory" : "file"}\nSize: ${s.size} bytes\nModified: ${s.mtime.toISOString()}\nPermissions: ${(s.mode & 0o777).toString(8)}`);
      } catch (e: any) {
        return err(`Failed: ${e.message}`);
      }
    },
  },
};
