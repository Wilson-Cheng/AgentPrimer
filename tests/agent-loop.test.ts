import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;

async function loadAgent() {
  vi.resetModules();
  const agent = await import('../lib/agent');
  const reg = await import('../lib/builtin-tools-registry');
  return { ...agent, ...reg };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-loop-'));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  // System prompt + main agent files so buildSystemPrompt doesn't error.
  fs.writeFileSync(path.join(tempDir, 'data', 'system.md'), 'You are a test agent.', 'utf-8');
  fs.mkdirSync(path.join(tempDir, 'data', 'agents', 'main'), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, 'data', 'agents', 'main', 'agent.md'),
    '# main\n**System Prompt:** test\n**Tools:** all\n',
    'utf-8',
  );
  fs.writeFileSync(path.join(tempDir, 'data', 'agents', 'main', 'memory.md'), '', 'utf-8');
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ──────────────────────────────────────────────────────────────────────────
// createBuiltinTools – verify the tool set the agent loop receives
// ──────────────────────────────────────────────────────────────────────────

describe('createBuiltinTools', () => {
  it('returns a ToolSet with every enabled built-in', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');
    // ≥ 19 tools enabled by default (run_shell opts in)
    expect(Object.keys(tools).length).toBeGreaterThanOrEqual(19);
    expect(tools.read_file).toBeDefined();
    expect(tools.write_file).toBeDefined();
    expect(tools.append_memory).toBeDefined();
    expect(tools.create_agent).toBeDefined();
    expect(tools.run_subagent_async).toBeDefined();
    expect(tools.run_shell).toBeUndefined(); // disabled by default
  });

  it('excludes tools that have been disabled via setBuiltinToolEnabled', async () => {
    const { createBuiltinTools, setBuiltinToolEnabled } = await loadAgent();
    setBuiltinToolEnabled('write_file', false);
    const tools = createBuiltinTools('main');
    expect(tools.write_file).toBeUndefined();
    expect(tools.read_file).toBeDefined(); // unaffected
  });

  it('includes run_shell once explicitly enabled', async () => {
    const { createBuiltinTools, setBuiltinToolEnabled } = await loadAgent();
    setBuiltinToolEnabled('run_shell', true);
    const tools = createBuiltinTools('main');
    expect(tools.run_shell).toBeDefined();
    expect(typeof tools.run_shell.execute).toBe('function');
  });

  it('every tool definition exposes a description and a Zod parameters schema', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');
    for (const [name, def] of Object.entries(tools)) {
      expect(def.description, `${name} description`).toBeTruthy();
      expect(def.parameters, `${name} parameters`).toBeTruthy();
      // Zod schemas always have a `_def` property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((def.parameters as any)._def, `${name} parameters._def`).toBeDefined();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Built-in tool execute() — end-to-end through the filesystem
// ──────────────────────────────────────────────────────────────────────────

describe('built-in filesystem tools', () => {
  it('write_file then read_file round-trips content correctly', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');

    const target = path.join(tempDir, 'data', 'sample.txt');
    const writeResult = await tools.write_file.execute!({
      file_path: target,
      content: 'hello agentprimer',
    });
    expect(writeResult).toMatchObject({ path: target });

    const readResult = await tools.read_file.execute!({ file_path: target });
    expect((readResult as { content: string }).content).toBe('hello agentprimer');
  });

  // Regression test: the Tool Playground and direct test calls bypass Zod
  // validation, so Zod's `.default('utf8')` doesn't fire. The execute
  // function must default `encoding` itself — otherwise readFile returns a
  // raw Buffer instead of the expected string.
  it('read_file defaults to utf8 when encoding is omitted (Zod-bypass safety)', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');

    const target = path.join(tempDir, 'data', 'no-encoding.txt');
    await fs.promises.writeFile(target, 'plain text content', 'utf-8');

    // Deliberately omit `encoding` — mirrors what the Tool Playground sends
    // when the user doesn't fill the field.
    const result = await tools.read_file.execute!({ file_path: target });
    expect(typeof (result as { content: string }).content).toBe('string');
    expect((result as { content: string }).content).toBe('plain text content');
  });

  it('write_file defaults to utf8 when encoding is omitted', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');

    const target = path.join(tempDir, 'data', 'no-encoding-write.txt');
    // Omit `encoding` to verify the execute-side default kicks in.
    await tools.write_file.execute!({ file_path: target, content: 'wrote without encoding' });

    const raw = await fs.promises.readFile(target, 'utf-8');
    expect(raw).toBe('wrote without encoding');
  });

  it('append_memory writes to the active agent memory and is isolated', async () => {
    const { createBuiltinTools } = await loadAgent();
    const coderTools = createBuiltinTools('coder');
    const researcherTools = createBuiltinTools('researcher');

    await coderTools.append_memory.execute!({ content: 'remember Alice' });
    await researcherTools.append_memory.execute!({ content: 'remember Bob' });

    const coderPath = path.join(tempDir, 'data', 'agents', 'coder', 'memory.md');
    const researcherPath = path.join(tempDir, 'data', 'agents', 'researcher', 'memory.md');
    const coderResult = await coderTools.read_file.execute!({ file_path: coderPath });
    const researcherResult = await researcherTools.read_file.execute!({
      file_path: researcherPath,
    });
    expect((coderResult as { content: string }).content).toContain('remember Alice');
    expect((coderResult as { content: string }).content).not.toContain('remember Bob');
    expect((researcherResult as { content: string }).content).toContain('remember Bob');
  });

  it('create_agent creates an agent folder with agent.md and memory.md', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');

    const result = await tools.create_agent.execute!({
      name: 'QA Reviewer',
      system_prompt: 'You review test plans and identify missing coverage.',
      tools: 'read_file, search_files',
      model: 'default',
    });

    expect(result).toMatchObject({ success: true, agent_name: 'qa-reviewer' });
    const agentPath = path.join(tempDir, 'data', 'agents', 'qa-reviewer', 'agent.md');
    const memoryPath = path.join(tempDir, 'data', 'agents', 'qa-reviewer', 'memory.md');
    expect(fs.readFileSync(agentPath, 'utf-8')).toContain('You review test plans');
    expect(fs.readFileSync(agentPath, 'utf-8')).toContain('**Tools:** read_file, search_files');
    expect(fs.readFileSync(memoryPath, 'utf-8')).toContain('# qa-reviewer Memory');
  });

  it('edit_file rejects an ambiguous old_string match', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');

    const target = path.join(tempDir, 'data', 'edit.txt');
    fs.writeFileSync(target, 'line\nline\nline\n', 'utf-8');

    const result = await tools.edit_file.execute!({
      file_path: target,
      old_string: 'line',
      new_string: 'changed',
    });
    // edit_file returns an error envelope when the match is ambiguous instead of throwing
    expect(result).toMatchObject({
      error: expect.stringMatching(/multiple|ambiguous|more than once|matches \d+ locations/i),
    });
  });

  it('list_directory returns the entries of an existing directory', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');

    const dir = path.join(tempDir, 'data', 'listme');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a', 'utf-8');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b', 'utf-8');

    const result = await tools.list_directory.execute!({ dir_path: dir });
    // The exact shape varies but the result MUST include both file names
    const json = JSON.stringify(result);
    expect(json).toContain('a.txt');
    expect(json).toContain('b.txt');
  });

  it('edit_file refuses paths outside the data sandbox', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');

    const target = path.join(tempDir, 'outside.txt');
    fs.writeFileSync(target, 'secret', 'utf-8');

    const result = await tools.edit_file.execute!({
      file_path: target,
      old_string: 'secret',
      new_string: 'changed',
    });

    expect(result).toMatchObject({
      error: expect.stringMatching(/outside the project data directory/i),
    });
    expect(fs.readFileSync(target, 'utf-8')).toBe('secret');
  });

  it('open_preview refuses paths outside the data sandbox', async () => {
    const { createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');

    const result = await tools.open_preview.execute!({
      file_path: path.join(tempDir, 'outside.html'),
    });

    expect(result).toMatchObject({
      error: expect.stringMatching(/outside the project data directory/i),
    });
  });

  it('dangerous approval-backed tools fail closed without session context', async () => {
    const { createBuiltinTools, setBuiltinToolEnabled } = await loadAgent();
    setBuiltinToolEnabled('run_shell', true);
    const tools = createBuiltinTools('main');

    const target = path.join(tempDir, 'data', 'delete-me.txt');
    fs.writeFileSync(target, 'delete me', 'utf-8');

    await expect(tools.run_shell.execute!({ command: 'echo hello' })).resolves.toMatchObject({
      error: expect.stringMatching(/requires an interactive chat session/i),
    });
    await expect(tools.delete_path.execute!({ target_path: target })).resolves.toMatchObject({
      error: expect.stringMatching(/requires an interactive chat session/i),
    });
    expect(fs.existsSync(target)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// zodToOpenAISchema — used everywhere the loop converts a tool to OpenAI
// format. Important enough to deserve its own multi-shape test here.
// ──────────────────────────────────────────────────────────────────────────

describe('zodToOpenAISchema (shapes the agent loop produces)', () => {
  it('handles every built-in tool without leaving $schema or undefined fields', async () => {
    const { zodToOpenAISchema, createBuiltinTools } = await loadAgent();
    const tools = createBuiltinTools('main');

    for (const [name, def] of Object.entries(tools)) {
      const json = zodToOpenAISchema(def.parameters);
      expect(json, `${name}`).not.toHaveProperty('$schema');
      expect(json, `${name}`).toMatchObject({ type: 'object' });
      // Round-trip through JSON.stringify to flush out non-serializable values
      expect(() => JSON.stringify(json)).not.toThrow();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// getBuiltinToolParameterSchemas – feeds the Tool Playground UI. We need to
// know that disabling a tool removes it from this list too.
// ──────────────────────────────────────────────────────────────────────────

describe('getBuiltinToolParameterSchemas', () => {
  it('reflects setting overrides — disabled tools disappear', async () => {
    const { getBuiltinToolParameterSchemas, setBuiltinToolEnabled } = await loadAgent();
    expect(getBuiltinToolParameterSchemas().read_file).toBeDefined();

    setBuiltinToolEnabled('read_file', false);
    expect(getBuiltinToolParameterSchemas().read_file).toBeUndefined();

    setBuiltinToolEnabled('read_file', true);
    expect(getBuiltinToolParameterSchemas().read_file).toBeDefined();
  });
});
