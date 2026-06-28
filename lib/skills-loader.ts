/**
 * lib/skills-loader.ts
 * ---------------------------------------------------------------------------
 * Loads SKILL.md skills and injects their content into the agent system prompt.
 *
 * ── What are SKILL.md skills? ─────────────────────────────────────────────
 * Skills follow the agentskills.io open standard. A skill is a directory
 * containing at minimum a SKILL.md file with YAML frontmatter:
 *
 *   my-skill/
 *   ├── SKILL.md          ← Required: frontmatter + instructions
 *   ├── scripts/          ← Optional: executable code the agent can run
 *   ├── references/       ← Optional: detailed documentation
 *   └── assets/           ← Optional: templates, data files
 *
 * ── How skills differ from function tools ────────────────────────────────
 *
 *   ┌─────────────────┬────────────────────────────────────────────────────┐
 *   │ Skill (SKILL.md)│ Instructions injected into the system prompt.      │
 *   │                 │ The agent reads them and REASONS about the task.   │
 *   │                 │ No code execution. Pure context injection.         │
 *   ├─────────────────┼────────────────────────────────────────────────────┤
 *   │ Function Tool   │ A callable function. The model emits a tool_call   │
 *   │                 │ with JSON arguments. The server executes the code  │
 *   │                 │ in a subprocess and feeds the result back.         │
 *   ├─────────────────┼────────────────────────────────────────────────────┤
 *   │ MCP Tool        │ Same as function tool, but the function runs in a  │
 *   │                 │ separate MCP server process (local or remote).     │
 *   └─────────────────┴────────────────────────────────────────────────────┘
 *
 * ── Progressive disclosure (agentskills.io spec) ─────────────────────────
 * The spec defines three loading stages to minimise context window usage:
 *
 *   Stage 1 — Discovery (~100 tokens per skill):
 *     Only the `name` and `description` frontmatter fields are loaded.
 *     This lets the agent know what skills are available without loading
 *     all instruction bodies.
 *
 *   Stage 2 — Activation (<5000 tokens per skill):
 *     When the agent determines a task matches a skill, it reads the full
 *     SKILL.md body into context. This is the "instructions" stage.
 *
 *   Stage 3 — Execution (on demand):
 *     The agent loads referenced files from scripts/, references/, assets/
 *     using read_file when it needs them for a specific subtask.
 *
 * In this implementation we follow the spec end-to-end. The main streaming
 * agent injects only Stage 1 (name + description) into the system prompt
 * and exposes a built-in `load_skill` tool that the model calls to perform
 * the Stage 2 activation lazily, on demand. Stage 3 reads (scripts/,
 * references/, assets/) happen through the normal `read_file` tool.
 *
 * ── Supported clients ────────────────────────────────────────────────────
 * The SKILL.md format is supported by VS Code, GitHub Copilot, Claude Code,
 * OpenCode, Goose, OpenHands, and many more. See agentskills.io/clients.
 */

import fs from 'fs';
import path from 'path';
import { listSkills } from './db';

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * Parsed content of a single SKILL.md file.
 * This is what gets injected into the agent system prompt.
 */
export interface SkillContext {
  /** Skill directory name and skill name (must match per spec) */
  name: string;
  /** One-line description from frontmatter — used for skill discovery */
  description: string;
  /** Full Markdown body (everything after the closing ---) */
  body: string;
  /** Raw SKILL.md text (for display in Tool Playground) */
  raw: string;
}

// ── SKILL.md parser ───────────────────────────────────────────────────────

/**
 * Parse a SKILL.md file into its component parts.
 *
 * SKILL.md structure:
 *   ---
 *   name: skill-name
 *   description: What this skill does and when to use it.
 *   [optional fields…]
 *   ---
 *   <Markdown body — the actual instructions>
 *
 * Uses simple regex extraction (no full YAML parser needed since frontmatter
 * only uses scalar string values at the top level).
 *
 * Returns null if required frontmatter fields (name, description) are absent.
 */
function parseSkillMd(content: string): { name: string; description: string; body: string } | null {
  if (!content.startsWith('---')) return null;

  const closeIdx = content.indexOf('\n---', 3);
  if (closeIdx === -1) return null;

  const frontmatter = content.slice(3, closeIdx).trim();
  const body        = content.slice(closeIdx + 4).trim();

  // Match "key: value" — handles optional surrounding quotes
  const nameMatch = frontmatter.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m);

  const name        = nameMatch?.[1]?.trim() ?? '';
  const description = descMatch?.[1]?.trim() ?? '';

  if (!name || !description) return null;
  return { name, description, body };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Load all enabled SKILL.md skills and return their parsed content.
 *
 * This is the Stage 2 loader: it reads the full SKILL.md body for every
 * enabled (and optionally filtered) skill.
 *
 * Called by:
 *   - lib/agent.ts → loadOneSkillBody() / buildSkillDiscoverySection()
 *   - app/api/tools/route.ts → to list skills in the Tool Playground
 *
 * @param filterNames  'all' = load all enabled skills
 *                     string[] = only skills whose name matches an entry
 *                     (used for per-agent tool restrictions in agent.md)
 */
export function loadSkillContext(filterNames: string[] | 'all' = 'all'): SkillContext[] {
  const skills  = listSkills().filter(s => s.enabled === 1);
  const results: SkillContext[] = [];

  for (const skill of skills) {
    // ── Stage 1: Discovery — apply the per-agent filter ────────────────
    if (filterNames !== 'all' && !filterNames.includes(skill.name)) continue;

    const skillMdPath = path.join(skill.local_path, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      // Skill is registered in the DB but the SKILL.md file is missing —
      // this can happen if the skill directory was manually deleted.
      console.warn(`skills-loader: "${skill.name}" is missing SKILL.md at ${skillMdPath}`);
      continue;
    }

    try {
      // ── Stage 2: Activation — read the full instruction body ────────
      const raw    = fs.readFileSync(skillMdPath, 'utf-8');
      const parsed = parseSkillMd(raw);

      if (!parsed) {
        console.warn(`skills-loader: "${skill.name}" has invalid SKILL.md (missing name/description frontmatter)`);
        continue;
      }

      results.push({ ...parsed, raw });
    } catch (err) {
      console.warn(`skills-loader: could not read SKILL.md for "${skill.name}":`, err);
    }
  }

  return results;
}

// ── Progressive disclosure helpers ────────────────────────────────────────
//
// The previous implementation injected every enabled SKILL.md body into the
// system prompt on every request (the comment block above describes this as
// "Stage 2 always-on"). With many or large skills this both wastes tokens
// and dilutes the model's focus.
//
// We now follow the agentskills.io spec properly:
//
//   Stage 1  — Discovery: inject only `name` + `description` per skill.
//              The model decides whether any skill is relevant.
//   Stage 2  — Activation: the model calls the built-in `load_skill` tool
//              with a skill name; the server returns the full SKILL.md body
//              as the tool result, which the model then follows.
//   Stage 3  — Execution: any files referenced by the skill (scripts/,
//              references/, assets/) are loaded via `read_file` on demand.
//
// `buildSkillDiscoverySection` produces the Stage 1 system-prompt block, and
// `loadOneSkillBody` is what `load_skill` calls to materialise Stage 2.

/**
 * Lightweight skill metadata used for the Stage 1 discovery list.
 * Carries only what the model needs to decide whether to activate the skill.
 */
export interface SkillDiscovery {
  name: string;
  description: string;
}

/**
 * Stage 1 — Discovery.
 *
 * Returns the system-prompt section that lists every enabled skill's name +
 * description (only) and tells the model how to load the full body. Also
 * returns the same metadata as a structured array so the UI / agent loop can
 * surface "available skills" without re-reading every file.
 *
 * Token cost: ~100 tokens per skill (vs ~5000 tokens per skill for full body).
 *
 * Returns `{ section: '', skills: [] }` when no enabled skills match.
 */
export function buildSkillDiscoverySection(
  filterNames: string[] | 'all' = 'all',
): { section: string; skills: SkillDiscovery[] } {
  const contexts = loadSkillContext(filterNames);
  if (contexts.length === 0) return { section: '', skills: [] };

  const skills: SkillDiscovery[] = contexts.map(c => ({
    name: c.name,
    description: c.description,
  }));

  const list = skills.map(s => `- **${s.name}** — ${s.description}`).join('\n');

  const section =
    `\n\n## Available Skills\n` +
    `You have the following skill modules available. Each skill is a self-contained ` +
    `instruction module you can activate when its scope matches the user's task.\n\n` +
    `Only the **name** and **description** are loaded here. To activate a skill and ` +
    `read its full instructions, call the built-in tool \`load_skill\` with the ` +
    `skill's name. After it returns, follow the instructions in the loaded body for ` +
    `the rest of this task.\n\n` +
    list;

  return { section, skills };
}

/**
 * Stage 2 — Activation. Read the full SKILL.md body for a single skill by
 * name, honouring the per-agent filter (so an agent cannot side-load a skill
 * its configuration disallows).
 *
 * Called by the built-in `load_skill` tool in lib/agent.ts. Returns null if
 * the skill is unknown, disabled, or outside the allowed list.
 */
export function loadOneSkillBody(
  skillName: string,
  filterNames: string[] | 'all' = 'all',
): { name: string; description: string; body: string; path: string } | null {
  if (filterNames !== 'all' && !filterNames.includes(skillName)) return null;

  const dbSkill = listSkills().find(s => s.enabled === 1 && s.name === skillName);
  if (!dbSkill) return null;

  const skillMdPath = path.join(dbSkill.local_path, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;

  try {
    const raw = fs.readFileSync(skillMdPath, 'utf-8');
    const parsed = parseSkillMd(raw);
    if (!parsed) return null;
    return { ...parsed, path: skillMdPath };
  } catch {
    return null;
  }
}

// ── Legacy helpers (Stage-2 always-on) ────────────────────────────────────
//
// These remain so that existing call sites (sub-agents, tests) keep working
// while the main agent loop migrates to progressive disclosure. They are no
// longer used by the primary streaming agent path.

/**
 * @deprecated Use `buildSkillDiscoverySection` + the `load_skill` built-in
 * tool for progressive disclosure. Kept for the sub-agent path which still
 * injects skill bodies eagerly.
 */
export function buildSkillContextSection(filterNames: string[] | 'all' = 'all'): string {
  return buildSkillContextWithMeta(filterNames).section;
}

/**
 * @deprecated See `buildSkillContextSection`.
 */
export function buildSkillContextWithMeta(
  filterNames: string[] | 'all' = 'all',
): { section: string; skills: Array<{ name: string; description: string }> } {
  const contexts = loadSkillContext(filterNames);
  if (contexts.length === 0) return { section: '', skills: [] };

  const sections = contexts.map(ctx =>
    `### Skill: ${ctx.name}\n${ctx.body}`
  ).join('\n\n---\n\n');

  const section =
    `\n\n## Active Skills\n` +
    `You have the following skill modules loaded. ` +
    `Follow their instructions when tasks match their scope.\n\n` +
    sections;

  return {
    section,
    skills: contexts.map(c => ({ name: c.name, description: c.description })),
  };
}
