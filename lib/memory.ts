/**
 * lib/memory.ts
 * ---------------------------------------------------------------------------
 * Helpers for reading/writing global prompts and per-agent folders.
 *
 * AgentPrimer's canonical agent layout is:
 *   data/agents/<agent>/agent.md  – agent prompt, tools, model, schema config
 *   data/agents/<agent>/memory.md – private long-term memory for that agent
 */

import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './db';

export const MAIN_AGENT_NAME = 'main';

export const SYSTEM_FILE = path.join(DATA_DIR, 'system.md');
export const AGENTS_DIR = path.join(DATA_DIR, 'agents');

const DEFAULT_MEMORY = `# Agent Memory

This file is injected into this agent's conversations as part of the system prompt.
Use it to store this agent's preferences, frequently-used information, or notes.

# Dynamic Long-Term Memory (Update As Needed)

## User Preferences
- *[AI Note: Append user preferences, workflows, and style choices here]*

## Important Notes
- *[AI Note: Append critical, time-sensitive, or overarching project states here]*

## Learned Facts
- *[AI Note: Append factual discoveries about the local environment, tools, or codebase here]*
`;

const DEFAULT_AGENT = `# main

**System Prompt:** You are AgentPrimer, a helpful and capable AI assistant. You can use tools to help the user accomplish tasks. Always be clear, concise, and professional.

**Tools:** all
**Model:** default
`;

export function safeAgentDirName(agentName = MAIN_AGENT_NAME): string {
  const safe = agentName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe || MAIN_AGENT_NAME;
}

export function getAgentDir(agentName = MAIN_AGENT_NAME): string {
  return path.join(AGENTS_DIR, safeAgentDirName(agentName));
}

export function getAgentFile(agentName = MAIN_AGENT_NAME): string {
  return path.join(getAgentDir(agentName), 'agent.md');
}

export function getAgentMemoryFile(agentName = MAIN_AGENT_NAME): string {
  return path.join(getAgentDir(agentName), 'memory.md');
}

export function getAgentRelativePath(agentName = MAIN_AGENT_NAME): string {
  return path.join('agents', safeAgentDirName(agentName), 'agent.md');
}

export function getAgentMemoryRelativePath(agentName = MAIN_AGENT_NAME): string {
  return path.join('agents', safeAgentDirName(agentName), 'memory.md');
}

function ensureMainAgent(): void {
  const mainDir = getAgentDir(MAIN_AGENT_NAME);
  fs.mkdirSync(mainDir, { recursive: true });
  const agentFile = getAgentFile(MAIN_AGENT_NAME);
  const memoryFile = getAgentMemoryFile(MAIN_AGENT_NAME);
  if (!fs.existsSync(agentFile)) fs.writeFileSync(agentFile, DEFAULT_AGENT, 'utf-8');
  if (!fs.existsSync(memoryFile)) fs.writeFileSync(memoryFile, DEFAULT_MEMORY, 'utf-8');
}

export function readSystemPrompt(): string {
  if (!fs.existsSync(SYSTEM_FILE)) return '';
  return fs.readFileSync(SYSTEM_FILE, 'utf-8').trim();
}

export function writeSystemPrompt(content: string): void {
  fs.writeFileSync(SYSTEM_FILE, content, 'utf-8');
}

export function readAgent(agentName = MAIN_AGENT_NAME): string {
  ensureMainAgent();
  const file = getAgentFile(agentName);
  if (!fs.existsSync(file)) return fs.readFileSync(getAgentFile(MAIN_AGENT_NAME), 'utf-8');
  return fs.readFileSync(file, 'utf-8');
}

export function writeAgent(agentName: string, content: string): void {
  const dir = getAgentDir(agentName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent.md'), content, 'utf-8');
}

export function readMemory(agentName = MAIN_AGENT_NAME): string {
  ensureMainAgent();
  const file = getAgentMemoryFile(agentName);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(getAgentDir(agentName), { recursive: true });
    fs.writeFileSync(file, DEFAULT_MEMORY, 'utf-8');
  }
  return fs.readFileSync(file, 'utf-8');
}

export function writeMemory(content: string, agentName = MAIN_AGENT_NAME): void {
  fs.mkdirSync(getAgentDir(agentName), { recursive: true });
  fs.writeFileSync(getAgentMemoryFile(agentName), content, 'utf-8');
}

export interface OutputSchema {
  label: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools: string[] | 'all';
  model?: string;
  outputSchema?: OutputSchema;
}

export function hasNoTools(tools: AgentConfig['tools']): boolean {
  return Array.isArray(tools) && tools.length === 1 && tools[0].toLowerCase() === 'none';
}

function parseOutputSchema(
  block: string,
  agentDir: string,
  name: string,
): OutputSchema | undefined {
  const labelMatch = block.match(
    /\*\*Output Schema:\*\*\s*([^\n]+)\n([\s\S]*?)(?=\n\*\*(?:System Prompt|Tools|Model|Output Schema|Output Schema File):\*\*|$)/i,
  );
  const schemaFileMatch = block.match(/\*\*Output Schema File:\*\*\s*([^\n]+)/i);
  if (!labelMatch && !schemaFileMatch) return undefined;

  const label = labelMatch?.[1]?.trim() || 'Output Schema';
  const afterLabel = labelMatch?.[2] ?? '';
  const beforeFence = afterLabel.split(/```json/i)[0];
  const description =
    beforeFence
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';

  let schemaRaw = '';
  if (schemaFileMatch) {
    const rel = schemaFileMatch[1].trim();
    const resolved = path.resolve(agentDir, rel);
    if (!resolved.startsWith(agentDir + path.sep)) {
      console.warn(`[agent] Ignoring schema file outside agent directory for "${name}".`);
      return undefined;
    }
    try {
      schemaRaw = fs.readFileSync(resolved, 'utf-8');
    } catch (err) {
      console.warn(
        `[agent] Failed to read schema file for "${name}": ${err instanceof Error ? err.message : String(err)}.`,
      );
      return undefined;
    }
  } else {
    const fenceMatch = afterLabel.match(/```json\s*([\s\S]*?)```/i);
    if (!fenceMatch) return undefined;
    schemaRaw = fenceMatch[1];
  }

  try {
    const schema = JSON.parse(schemaRaw) as Record<string, unknown>;
    return { label, description, schema };
  } catch (err) {
    console.warn(
      `[agent] Failed to parse JSON schema for agent "${name}": ${err instanceof Error ? err.message : String(err)}. ` +
        `Agent will fall back to the regular ReAct loop.`,
    );
    return undefined;
  }
}

export function parseAgentConfig(agentName: string): AgentConfig | null {
  const dir = getAgentDir(agentName);
  const file = path.join(dir, 'agent.md');
  if (!fs.existsSync(file)) return null;
  const block = fs.readFileSync(file, 'utf-8');
  const firstLine = block.split('\n')[0]?.trim() ?? '';
  const headingName = firstLine.startsWith('#') ? firstLine.replace(/^#+\s*/, '').trim() : '';
  const name = headingName || safeAgentDirName(agentName);

  const systemPromptMatch = block.match(
    /\*\*System Prompt:\*\*[ \t]*([\s\S]*?)(?=\n\*\*(?:Tools|Model|Output Schema|Output Schema File):\*\*|$)/i,
  );
  const systemPrompt = systemPromptMatch ? systemPromptMatch[1].trim() : '';

  const hasSchema = /\*\*(?:Output Schema|Output Schema File):\*\*/i.test(block);
  const toolsMatch = block.match(/\*\*Tools:\*\*\s*([^\n]+)/i);
  const toolsRaw = toolsMatch ? toolsMatch[1].trim() : hasSchema ? 'none' : 'all';
  const tools: string[] | 'all' =
    toolsRaw.toLowerCase() === 'all'
      ? 'all'
      : toolsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

  const modelMatch = block.match(/\*\*Model:\*\*\s*([^\n]+)/i);
  const modelRaw = modelMatch ? modelMatch[1].trim() : '';
  const model = modelRaw && modelRaw.toLowerCase() !== 'default' ? modelRaw : undefined;

  const outputSchema = parseOutputSchema(block, dir, name);

  return { name, systemPrompt, tools, model, outputSchema };
}

export function listAgentNames(): string[] {
  ensureMainAgent();
  if (!fs.existsSync(AGENTS_DIR)) return [MAIN_AGENT_NAME];
  const names = fs
    .readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(AGENTS_DIR, e.name, 'agent.md')))
    .map((e) => parseAgentConfig(e.name)?.name ?? e.name)
    .filter(Boolean)
    .sort((a, b) => {
      if (a === MAIN_AGENT_NAME) return -1;
      if (b === MAIN_AGENT_NAME) return 1;
      return a.localeCompare(b);
    });
  return names.length ? names : [MAIN_AGENT_NAME];
}

export function parseAgentsConfig(): AgentConfig[] {
  return listAgentNames()
    .map((name) => parseAgentConfig(name))
    .filter((agent): agent is AgentConfig => agent !== null);
}

export function getAgentConfig(name: string): AgentConfig {
  return (
    parseAgentConfig(name) ??
    parseAgentConfig(MAIN_AGENT_NAME) ?? {
      name: MAIN_AGENT_NAME,
      systemPrompt: '',
      tools: 'all',
    }
  );
}
