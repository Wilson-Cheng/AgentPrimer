import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;

async function loadInstaller() {
  vi.resetModules();
  const installer = await import('../lib/installer');
  const db = await import('../lib/db');
  return { ...installer, ...db };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-installer-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const VALID_SKILL_MD = [
  '---',
  'name: hello-world',
  'description: Greet users warmly. Use for friendly hello messages.',
  '---',
  '',
  '# Hello World',
  '',
  'Say hello.',
].join('\n');

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers — no filesystem or DB needed
// ──────────────────────────────────────────────────────────────────────────

describe('repoNameFromUrl', () => {
  it('extracts the trailing segment of a GitHub URL', async () => {
    const { repoNameFromUrl } = await loadInstaller();
    expect(repoNameFromUrl('https://github.com/owner/my-skill')).toBe('my-skill');
    expect(repoNameFromUrl('https://github.com/owner/My-Skill.git')).toBe('my-skill');
    expect(repoNameFromUrl('git@github.com:owner/another_repo.git')).toBe('another_repo');
  });

  it('sanitizes unsafe characters and trailing slashes', async () => {
    const { repoNameFromUrl } = await loadInstaller();
    expect(repoNameFromUrl('https://github.com/owner/weird name!repo/')).toBe('weird-name-repo');
  });
});

describe('nameFromPackageArg', () => {
  it('strips @scope/ prefix and @version suffix', async () => {
    const { nameFromPackageArg } = await loadInstaller();
    expect(nameFromPackageArg(['@upstash/context7-mcp@latest'])).toBe('context7-mcp');
    expect(nameFromPackageArg(['exa-mcp-server'])).toBe('exa-mcp-server');
    expect(nameFromPackageArg(['-y', '@modelcontextprotocol/server-everything'])).toBe(
      'server-everything',
    );
  });

  it('returns empty when no positional argument is present', async () => {
    const { nameFromPackageArg } = await loadInstaller();
    expect(nameFromPackageArg(['-y', '--flag'])).toBe('');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// installLocalSkill — happy path (no shelling out)
// ──────────────────────────────────────────────────────────────────────────

describe('installLocalSkill', () => {
  it('registers a SKILL.md skill and writes it to the DB', async () => {
    const { installLocalSkill, listSkills, uninstallSkill } = await loadInstaller();
    const skillDir = path.join(tempDir, 'data', 'skills', 'hello-world');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), VALID_SKILL_MD, 'utf-8');

    const result = installLocalSkill(skillDir, 1);

    expect(result.name).toBe('hello-world');
    expect(result.localPath).toBe(skillDir);

    const all = listSkills();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('hello-world');
    expect(all[0].enabled).toBe(1);
    expect(all[0].manifest_json).toContain('# Hello World');

    // Cleanup: uninstall removes the directory and the row
    uninstallSkill(result.id);
    expect(fs.existsSync(skillDir)).toBe(false);
    expect(listSkills()).toHaveLength(0);
  });

  it('throws a clear error when SKILL.md is missing', async () => {
    const { installLocalSkill } = await loadInstaller();
    const skillDir = path.join(tempDir, 'data', 'skills', 'no-md');
    fs.mkdirSync(skillDir, { recursive: true });

    expect(() => installLocalSkill(skillDir, 0)).toThrow(/SKILL\.md not found/);
  });

  it('throws when SKILL.md frontmatter is missing the name field', async () => {
    const { installLocalSkill } = await loadInstaller();
    const skillDir = path.join(tempDir, 'data', 'skills', 'no-name');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\ndescription: missing name field\n---\n# body',
      'utf-8',
    );

    expect(() => installLocalSkill(skillDir, 0)).toThrow(/name/);
  });

  it('throws when SKILL.md frontmatter is missing the description field', async () => {
    const { installLocalSkill } = await loadInstaller();
    const skillDir = path.join(tempDir, 'data', 'skills', 'no-desc');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: ok\n---\n# body', 'utf-8');

    expect(() => installLocalSkill(skillDir, 0)).toThrow(/description/);
  });

  it('throws when frontmatter has no closing delimiter', async () => {
    const { installLocalSkill } = await loadInstaller();
    const skillDir = path.join(tempDir, 'data', 'skills', 'unterminated');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: still-going\ndescription: ...\n\n# body never closes the frontmatter',
      'utf-8',
    );

    expect(() => installLocalSkill(skillDir, 0)).toThrow(/malformed frontmatter/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// installMcpServer — no git clone needed for the stdio+command path
// ──────────────────────────────────────────────────────────────────────────

describe('installMcpServer', () => {
  it('registers an SSE MCP server from a URL with no GitHub clone', async () => {
    const { installMcpServer, listMcpServers, uninstallMcpServer } = await loadInstaller();

    const result = installMcpServer('', {
      transport: 'sse',
      command: '',
      url: 'https://my-mcp.example.com/sse',
    });

    expect(result.name).toBeTruthy();
    const all = listMcpServers();
    expect(all).toHaveLength(1);
    expect(all[0].transport).toBe('sse');
    expect(all[0].url).toBe('https://my-mcp.example.com/sse');

    uninstallMcpServer(result.id);
    expect(listMcpServers()).toHaveLength(0);
  });

  it('registers a stdio MCP server that runs an npx package without cloning', async () => {
    const { installMcpServer, listMcpServers, uninstallMcpServer } = await loadInstaller();

    const result = installMcpServer('', {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    });

    expect(result.name).toBe('server-everything');
    const all = listMcpServers();
    expect(all[0].command).toBe('npx');
    expect(JSON.parse(all[0].args_json)).toEqual(['-y', '@modelcontextprotocol/server-everything']);

    uninstallMcpServer(result.id);
  });
});
