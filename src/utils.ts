import { execFile, execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const SCRIPT_DIR = resolve(HOME, ".local/share/bin");
const DEFAULT_TIMEOUT = 5000;

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function safeExec(
  cmd: string,
  args: string[] = [],
  timeout = DEFAULT_TIMEOUT
): Promise<ExecResult> {
  return new Promise((res) => {
    const child = execFile(
      cmd,
      args,
      { timeout, env: { ...process.env, PATH: `${SCRIPT_DIR}:${process.env.PATH}` } },
      (error, stdout, stderr) => {
        res({
          stdout: stdout?.toString().trim() ?? "",
          stderr: stderr?.toString().trim() ?? "",
          exitCode: error ? (error as any).code ?? 1 : 0,
        });
      }
    );
  });
}

export function safeExecSync(
  cmd: string,
  args: string[] = [],
  timeout = DEFAULT_TIMEOUT
): string {
  try {
    return execFileSync(cmd, args, {
      timeout,
      encoding: "utf-8",
      env: { ...process.env, PATH: `${SCRIPT_DIR}:${process.env.PATH}` },
    }).trim();
  } catch (e: any) {
    return e.stdout?.toString().trim() ?? e.message;
  }
}

export async function hyprctl(
  sub: string,
  args: string[] = [],
  json = true
): Promise<any> {
  const fullArgs = json ? [sub, "-j", ...args] : [sub, ...args];
  const result = await safeExec("hyprctl", fullArgs);
  if (json && result.stdout) {
    try {
      return JSON.parse(result.stdout);
    } catch {
      return result.stdout;
    }
  }
  return result.stdout;
}

export function scriptPath(name: string): string {
  return resolve(SCRIPT_DIR, name);
}

export function expandPath(p: string): string {
  if (p.startsWith("~/")) return resolve(HOME, p.slice(2));
  return resolve(p);
}

export function isUnderHome(p: string): boolean {
  return resolve(p).startsWith(HOME);
}

export function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function err(text: string) {
  return { isError: true as const, content: [{ type: "text" as const, text }] };
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  annotations?: Record<string, any>;
}

export type ToolHandler = (args: Record<string, any>) => Promise<any>;

export interface ToolModule {
  tools: ToolDef[];
  handlers: Record<string, ToolHandler>;
}
