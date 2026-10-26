import { ok, err, type ToolModule, type ToolHandler } from "../utils.js";
import {
  loadMacros,
  saveMacros,
  executeMacro,
  getMacrosPath,
  type MacroDef,
  type MacroStep,
} from "../macro-engine.js";

const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DES = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

/**
 * The macro tools need access to ALL other tool handlers to execute macros.
 * This is set by index.ts after all modules are loaded.
 */
let globalHandlerLookup: (name: string) => ToolHandler | undefined = () => undefined;

export function setMacroHandlerLookup(
  lookup: (name: string) => ToolHandler | undefined
) {
  globalHandlerLookup = lookup;
}

export const macroTools: ToolModule = {
  tools: [
    {
      name: "run_macro",
      description:
        "Run a named macro (predefined chain of tools). Macros are defined in ~/.config/hypr/macros.json",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Macro name to run" },
        },
        required: ["name"],
      },
      annotations: WR,
    },
    {
      name: "list_macros",
      description:
        "List all available macros with their descriptions and steps",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: RO,
    },
    {
      name: "get_macro",
      description: "Get full details of a specific macro",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Macro name" },
        },
        required: ["name"],
      },
      annotations: RO,
    },
    {
      name: "create_macro",
      description:
        "Create a new macro or overwrite an existing one. Steps are an array of {tool, params?} objects.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Macro name (lowercase, no spaces)" },
          description: { type: "string", description: "What this macro does" },
          steps: {
            type: "array",
            description: "Array of steps: [{tool: 'tool_name', params: {}}]",
            items: {
              type: "object",
              properties: {
                tool: { type: "string", description: "Tool name to call" },
                params: {
                  type: "object",
                  description: "Parameters for the tool",
                },
              },
              required: ["tool"],
            },
          },
        },
        required: ["name", "steps"],
      },
      annotations: WR,
    },
    {
      name: "delete_macro",
      description: "Delete a macro by name",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Macro name to delete" },
        },
        required: ["name"],
      },
      annotations: DES,
    },
  ],

  handlers: {
    async run_macro(args) {
      const macros = loadMacros();
      const macro = macros[args.name];
      if (!macro) {
        const available = Object.keys(macros);
        return err(
          `Macro "${args.name}" not found. Available: ${available.join(", ") || "none"}`
        );
      }

      const { results, errors } = await executeMacro(macro, globalHandlerLookup);

      const lines: string[] = [`Macro "${args.name}" executed (${macro.steps.length} steps)`];
      if (results.length > 0) {
        lines.push("", "Results:");
        lines.push(...results.map((r) => `  ✓ ${r}`));
      }
      if (errors.length > 0) {
        lines.push("", "Errors:");
        lines.push(...errors.map((e) => `  ✗ ${e}`));
      }

      return errors.length > 0 && results.length === 0
        ? err(lines.join("\n"))
        : ok(lines.join("\n"));
    },

    async list_macros() {
      const macros = loadMacros();
      const names = Object.keys(macros);
      if (names.length === 0) {
        return ok(`No macros defined. Create one with create_macro.\nConfig: ${getMacrosPath()}`);
      }

      const lines = names.map((name) => {
        const m = macros[name];
        const desc = m.description || "(no description)";
        const stepCount = m.steps.length;
        const tools = m.steps.map((s) => s.tool).join(" → ");
        return `${name}: ${desc} (${stepCount} steps: ${tools})`;
      });

      return ok(lines.join("\n"));
    },

    async get_macro(args) {
      const macros = loadMacros();
      const macro = macros[args.name];
      if (!macro) return err(`Macro "${args.name}" not found`);

      const lines = [
        `Macro: ${args.name}`,
        `Description: ${macro.description || "(none)"}`,
        `Steps (${macro.steps.length}):`,
      ];
      for (let i = 0; i < macro.steps.length; i++) {
        const s = macro.steps[i];
        const params = s.params ? ` ${JSON.stringify(s.params)}` : "";
        lines.push(`  ${i + 1}. ${s.tool}${params}`);
      }
      return ok(lines.join("\n"));
    },

    async create_macro(args) {
      const macros = loadMacros();
      const steps: MacroStep[] = args.steps.map((s: any) => ({
        tool: s.tool,
        params: s.params,
      }));

      macros[args.name] = {
        description: args.description || "",
        steps,
      };

      saveMacros(macros);
      return ok(
        `Macro "${args.name}" saved with ${steps.length} step(s) → ${getMacrosPath()}`
      );
    },

    async delete_macro(args) {
      const macros = loadMacros();
      if (!(args.name in macros)) return err(`Macro "${args.name}" not found`);
      delete macros[args.name];
      saveMacros(macros);
      return ok(`Macro "${args.name}" deleted`);
    },
  },
};
