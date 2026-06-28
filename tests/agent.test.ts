import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';

let tempDir: string;

async function loadAgent() {
  vi.resetModules();
  return import('../lib/agent');
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-agent-'));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('agent helper functions', () => {
  it('converts Zod schemas to OpenAI-compatible JSON Schema without $schema', async () => {
    const { zodToOpenAISchema } = await loadAgent();

    const schema = zodToOpenAISchema(z.object({
      path: z.string().describe('File path'),
      count: z.number().optional(),
    }));

    expect(schema).not.toHaveProperty('$schema');
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        count: { type: 'number' },
      },
      required: ['path'],
    });
  });

  it('builds system prompt from global system prompt, agent prompt, memory, and notifications', async () => {
    fs.writeFileSync(path.join(tempDir, 'data', 'system.md'), 'Global rule', 'utf-8');
    const { buildSystemPrompt } = await loadAgent();

    const prompt = buildSystemPrompt('Agent rule', 'Remember Alice', [
      {
        id: 'notification-1',
        session_id: 'session-1',
        task_id: 'task-1',
        task_file: 'data/tasks/task-1.md',
        summary: 'FINISHED: completed research',
        created_at: 1,
        read_at: null,
      },
    ]);

    expect(prompt).toContain('Global rule');
    expect(prompt).toContain('Agent rule');
    expect(prompt).toContain('Remember Alice');
    expect(prompt).toContain('## Persistent Memory');
    expect(prompt).toContain('## Pending Task Notifications');
    expect(prompt).toContain('task-1');
    // The Preview Panel / Async Sub-agent sections are now part of the
    // user-editable defaults/system.md content — they should NOT be
    // hardcoded into the platform code. (This test seeds only "Global
    // rule" so neither heading should appear.)
    expect(prompt).not.toContain('## Preview Panel');
    expect(prompt).not.toContain('## Async Sub-agent Orchestration');
  });

  it('returns an empty system prompt when system.md, agent prompt, and memory are all empty', async () => {
    fs.writeFileSync(path.join(tempDir, 'data', 'system.md'), '', 'utf-8');
    const { buildSystemPrompt } = await loadAgent();
    expect(buildSystemPrompt('', '')).toBe('');
  });

  it('builds the finalize-call system prompt embedding the schema', async () => {
    const { buildFinalizeSystemPrompt } = await loadAgent();

    const prompt = buildFinalizeSystemPrompt({
      label: 'Test Schema',
      description: 'Extracts fields',
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    });

    // The finalize prompt is intentionally lean — only the schema + format
    // rules. It must NOT include any global system.md content or agent
    // role-playing (those belong only in the main loop's prompt).
    expect(prompt).toContain('Test Schema');
    expect(prompt).toContain('Extracts fields');
    expect(prompt).toContain('Output ONLY the raw JSON');
    expect(prompt).toContain('"required"');
    expect(prompt).toContain('"name"');
  });

  it('exposes built-in tool schemas for the Tool Playground', async () => {
    const { getBuiltinToolParameterSchemas } = await loadAgent();

    const schemas = getBuiltinToolParameterSchemas();

    // 19 of 20 tools are enabled by default (run_shell is opt-in)
    expect(Object.keys(schemas).length).toBeGreaterThanOrEqual(19);
    expect(schemas.read_file.parameters).not.toHaveProperty('$schema');
    expect(schemas.read_file).toMatchObject({ category: 'filesystem' });
    expect(schemas.open_preview).toMatchObject({ category: 'output' });
    expect(schemas.run_shell).toBeUndefined(); // disabled by default
  });
});
