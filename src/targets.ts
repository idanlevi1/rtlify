import { stat } from "node:fs/promises";
import { join } from "node:path";

export const MARKER = "# RTLify Rules";

const POINTER_BODY = `${MARKER}
When creating or modifying UI components, layouts, or RTL text (Hebrew/Arabic/Persian), you MUST read and strictly adhere to the guidelines in \`.rtlify-rules.md\`.
`;

export interface Output {
  /** Absolute path of the file to write. */
  path: string;
  /** Content to append (shared config file) or write (dedicated rules file). */
  content: string;
}

export interface Target {
  id: string;
  label: string;
  /** Files/dirs whose existence signals this editor is in use. */
  detect: string[];
  resolve(cwd: string): Promise<Output>;
}

async function kind(p: string): Promise<"file" | "dir" | null> {
  try {
    const s = await stat(p);
    return s.isDirectory() ? "dir" : "file";
  } catch {
    return null;
  }
}

const append = (file: string) => async (cwd: string): Promise<Output> => ({ path: join(cwd, file), content: POINTER_BODY });

export const TARGETS: Target[] = [
  { id: "claude", label: "Claude Code", detect: [".claude", "CLAUDE.md"], resolve: append("CLAUDE.md") },
  {
    id: "cursor",
    label: "Cursor",
    detect: [".cursorrules", ".cursor"],
    async resolve(cwd) {
      // Legacy single-file rules still work — keep using it if the project has one.
      if ((await kind(join(cwd, ".cursorrules"))) === "file") return append(".cursorrules")(cwd);
      return {
        path: join(cwd, ".cursor", "rules", "rtlify.mdc"),
        content: `---\ndescription: RTL rules for UI code (Hebrew/Arabic/Persian)\nalwaysApply: true\n---\n\n${POINTER_BODY}`,
      };
    },
  },
  {
    id: "windsurf",
    label: "Windsurf",
    detect: [".windsurfrules", ".windsurf"],
    async resolve(cwd) {
      if ((await kind(join(cwd, ".windsurfrules"))) === "file") return append(".windsurfrules")(cwd);
      return {
        path: join(cwd, ".windsurf", "rules", "rtlify.md"),
        content: `---\ntrigger: always_on\n---\n\n${POINTER_BODY}`,
      };
    },
  },
  {
    id: "cline",
    label: "Cline",
    detect: [".clinerules"],
    async resolve(cwd) {
      // `.clinerules` may be a single file or a directory of rule files.
      if ((await kind(join(cwd, ".clinerules"))) === "file") return append(".clinerules")(cwd);
      return { path: join(cwd, ".clinerules", "rtlify.md"), content: POINTER_BODY };
    },
  },
  { id: "copilot", label: "Copilot", detect: [".github/copilot-instructions.md"], resolve: append(join(".github", "copilot-instructions.md")) },
  { id: "gemini", label: "Gemini CLI", detect: ["GEMINI.md"], resolve: append("GEMINI.md") },
  { id: "codex", label: "Codex CLI", detect: ["AGENTS.md"], resolve: append("AGENTS.md") },
];

export async function detectTargets(cwd: string): Promise<Target[]> {
  const found: Target[] = [];
  for (const target of TARGETS) {
    for (const signal of target.detect) {
      if (await kind(join(cwd, signal))) {
        found.push(target);
        break;
      }
    }
  }
  return found;
}
