import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;

async function loadMemory() {
  vi.resetModules();
  return import('../lib/memory');
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-memory-'));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('memory and agent config helpers', () => {
  it('creates main agent files when missing', async () => {
    const { readMemory, readAgent } = await loadMemory();

    expect(readAgent()).toContain('# main');
    expect(readMemory()).toContain('# Agent Memory');
    expect(fs.existsSync(path.join(tempDir, 'data', 'agents', 'main', 'agent.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'data', 'agents', 'main', 'memory.md'))).toBe(true);
  });

  it('reads and writes isolated per-agent memories', async () => {
    const { readMemory, writeMemory, getAgentMemoryRelativePath } = await loadMemory();

    writeMemory('coder memory', 'coder');
    writeMemory('researcher memory', 'researcher');

    expect(readMemory('coder')).toBe('coder memory');
    expect(readMemory('researcher')).toBe('researcher memory');
    expect(getAgentMemoryRelativePath('Coder Agent')).toBe(path.join('agents', 'coder-agent', 'memory.md'));
    expect(fs.existsSync(path.join(tempDir, 'data', 'agents', 'coder', 'memory.md'))).toBe(true);
  });

  it('reads and writes the system prompt', async () => {
    const { writeSystemPrompt, readSystemPrompt } = await loadMemory();

    writeSystemPrompt('system text');

    expect(readSystemPrompt()).toBe('system text');
  });

  it('parses multi-line agent prompts, tool lists, model, and schema file', async () => {
    const { writeAgent, parseAgentsConfig, getAgentConfig, listAgentNames } = await loadMemory();
    const analystDir = path.join(tempDir, 'data', 'agents', 'analyst');
    fs.mkdirSync(path.join(analystDir, 'schemas'), { recursive: true });
    fs.writeFileSync(
      path.join(analystDir, 'schemas', 'output.json'),
      '{ "type": "object", "properties": { "summary": { "type": "string" } }, "required": ["summary"] }',
      'utf-8',
    );

    writeAgent('analyst', `# analyst
**System Prompt:** First line.
## Keep this subheading
Second line.
**Output Schema:** Entity Extractor
Extracts people and key facts.
**Output Schema File:** schemas/output.json
**Tools:** read_file, write_file, skill__tool
**Model:** analyst-model
`);

    const agents = parseAgentsConfig();
    const analyst = getAgentConfig('analyst');

    expect(agents.map(a => a.name)).toContain('analyst');
    expect(analyst.systemPrompt).toContain('## Keep this subheading');
    expect(analyst.tools).toEqual(['read_file', 'write_file', 'skill__tool']);
    expect(analyst.model).toBe('analyst-model');
    expect(analyst.outputSchema).toBeDefined();
    expect(analyst.outputSchema?.label).toBe('Entity Extractor');
    expect(analyst.outputSchema?.description).toBe('Extracts people and key facts.');
    expect(analyst.outputSchema?.schema).toMatchObject({
      type: 'object',
      required: ['summary'],
    });
    expect(listAgentNames()).toEqual(['main', 'analyst']);
  });

  it('skips a malformed inline JSON schema and logs a warning instead of crashing', async () => {
    const { writeAgent, getAgentConfig } = await loadMemory();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    writeAgent('bad', `# bad
**System Prompt:** Bad schema agent.
**Output Schema:** Broken
A description.
\`\`\`json
{ not valid json
\`\`\`
**Tools:** all
`);

    const bad = getAgentConfig('bad');
    expect(bad.outputSchema).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to the main agent when an agent is missing', async () => {
    const { writeAgent, parseAgentsConfig, getAgentConfig } = await loadMemory();

    writeAgent('specialist', `# specialist
**System Prompt:** Specialist only.
**Tools:** append_memory
`);

    expect(parseAgentsConfig()[0].name).toBe('main');
    expect(getAgentConfig('missing').name).toBe('main');
  });
});
