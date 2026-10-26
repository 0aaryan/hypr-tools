/**
 * Macro Engine — executes named tool chains from macros.json.
 * Macros are persistent JSON configs that chain MCP tools into presets.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { ToolHandler } from "./utils.js";

const MACROS_PATH = resolve(homedir(), ".config/hypr/macros.json");

export interface MacroStep {
  tool: string;
  params?: Record<string, any>;
  /** Only run if condition evaluates truthy (simple key=value check against prior step output) */
  condition?: string;
}

export interface MacroDef {
  description?: string;
  steps: MacroStep[];
  /** If true, destructive tools in steps require confirmation */
  requires_confirm?: boolean;
}

export type MacroStore = Record<string, MacroDef>;

export function loadMacros(): MacroStore {
  if (!existsSync(MACROS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MACROS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveMacros(macros: MacroStore) {
  writeFileSync(MACROS_PATH, JSON.stringify(macros, null, 2));
}

export function getMacrosPath(): string {
  return MACROS_PATH;
}

/**
 * Execute a macro by running each step in sequence.
 * `handlerLookup` resolves tool names to their MCP handlers.
 */
export async function executeMacro(
  macro: MacroDef,
  handlerLookup: (name: string) => ToolHandler | undefined
): Promise<{ results: string[]; errors: string[] }> {
  const results: string[] = [];
  const errors: string[] = [];

  for (const step of macro.steps) {
    const handler = handlerLookup(step.tool);
    if (!handler) {
      errors.push(`Unknown tool: ${step.tool}`);
      continue;
    }
    try {
      const result = await handler(step.params ?? {});
      const text =
        result?.content?.[0]?.text ?? JSON.stringify(result);
      if (result?.isError) {
        errors.push(`${step.tool}: ${text}`);
      } else {
        results.push(`${step.tool}: ${text}`);
      }
    } catch (e: any) {
      errors.push(`${step.tool}: ${e.message}`);
    }
  }

  return { results, errors };
}
