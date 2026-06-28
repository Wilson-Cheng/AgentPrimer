/**
 * lib/installer.ts
 * ---------------------------------------------------------------------------
 * GitHub-based installer for Skills and MCP Servers.
 *
 * Flow:
 *   1. Clone the GitHub repository into /data/skills/<name> or /data/mcp-servers/<name>
 *   2. Run `npm install --omit=dev --ignore-scripts` in the cloned directory (if package.json exists)
 *   3. Read and validate the manifest file (SKILL.md for skills)
 *   4. Register in the SQLite database
 *
 * The /data directory is the persistent volume mount-point, so installed
 * skills and MCP servers survive container restarts.
 *
 * Security note: Only clone repositories from trusted sources. Install-time
 * dependency scripts are disabled, but installed MCP servers and callable tool
 * code still execute on the server when enabled.
 */

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DATA_DIR, getDb, upsertSkill, upsertMcpServer, deleteSkill, deleteMcpServer, getSkill, getMcpServer } from './db';

// ---------------------------------------------------------------------------
// Directory constants
// ---------------------------------------------------------------------------
export const SKILLS_DIR      = path.join(DATA_DIR, 'skills');
export const MCP_SERVERS_DIR = path.join(DATA_DIR, 'mcp-servers');

// Ensure directories exist
if (!fs.existsSync(SKILLS_DIR))      fs.mkdirSync(SKILLS_DIR, { recursive: true });
if (!fs.existsSync(MCP_SERVERS_DIR)) fs.mkdirSync(MCP_SERVERS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Parse a GitHub URL and extract a safe directory name
// e.g. https://github.com/owner/my-skill → "my-skill"
// ---------------------------------------------------------------------------
function repoNameFromUrl(githubUrl: string): string {
  const cleaned = githubUrl.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = cleaned.split('/');
  const name = parts[parts.length - 1];
  // Sanitize: allow only alphanumeric, dash, underscore
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
}

function assertGithubRepoUrl(githubUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(githubUrl);
  } catch {
    throw new Error('GitHub URL must be a valid HTTPS URL.');
  }

  const pathParts = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || pathParts.length !== 2) {
    throw new Error('GitHub URL must be an HTTPS repository URL like https://github.com/owner/repo.');
  }
}

// Exported for tests — pure URL→name transformation
export { repoNameFromUrl };

// ---------------------------------------------------------------------------
// Parse a SKILL.md file and extract { name, description } from its frontmatter
// ---------------------------------------------------------------------------
interface SkillManifest {
  name: string;
  description: string;
  raw: string;
}

function parseSkillMd(filePath: string): SkillManifest {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.startsWith('---')) {
    throw new Error(`SKILL.md at ${filePath} is missing required YAML frontmatter.`);
  }

  const closeIdx = raw.indexOf('\n---', 3);
  if (closeIdx === -1) {
    throw new Error(`SKILL.md at ${filePath} has malformed frontmatter (no closing ---).`);
  }

  const frontmatter = raw.slice(3, closeIdx).trim();
  const nameMatch = frontmatter.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m);

  if (!nameMatch) throw new Error('SKILL.md frontmatter must include a "name" field.');
  if (!descMatch) throw new Error('SKILL.md frontmatter must include a "description" field.');

  return {
    name:        nameMatch[1].trim(),
    description: descMatch[1].trim(),
    raw,
  };
}

// ---------------------------------------------------------------------------
// Install a SKILL.md skill from a GitHub URL
// ---------------------------------------------------------------------------
export interface InstallSkillResult {
  id: string;
  name: string;
  localPath: string;
}

export function installSkill(githubUrl: string): InstallSkillResult {
  assertGithubRepoUrl(githubUrl);
  const repoName = repoNameFromUrl(githubUrl);
  const localPath = path.join(SKILLS_DIR, repoName);

  // Clone or pull the repository
  if (fs.existsSync(localPath)) {
    // Already installed – pull latest changes
    execFileSync('git', ['-C', localPath, 'pull', '--ff-only'], { stdio: 'pipe' });
  } else {
    // Fresh clone
    execFileSync('git', ['clone', '--depth=1', githubUrl, localPath], { stdio: 'pipe' });
  }

  // Install npm dependencies if the skill ships scripts that need them
  if (fs.existsSync(path.join(localPath, 'package.json'))) {
    execSync('npm install --omit=dev --ignore-scripts --no-audit', { cwd: localPath, stdio: 'pipe' });
  }

  // Read and validate SKILL.md manifest
  const manifestPath = path.join(localPath, 'SKILL.md');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`SKILL.md not found in repository. Skills must include a SKILL.md file at the repository root.`);
  }

  const manifest = parseSkillMd(manifestPath);
  const id = uuidv4();

  upsertSkill({
    id,
    name: manifest.name,
    github_url: githubUrl,
    local_path: localPath,
    enabled: 1,
    // Store the raw SKILL.md content; the API route extracts metadata from it on demand.
    manifest_json: manifest.raw,
  });

  return { id, name: manifest.name, localPath };
}

// ---------------------------------------------------------------------------
// Register an already-present local SKILL.md skill directory (no cloning).
// Used by the create_skill agent tool to register skills it writes to disk.
// ---------------------------------------------------------------------------
export function installLocalSkill(localPath: string, enabled = 0): InstallSkillResult {
  const manifestPath = path.join(localPath, 'SKILL.md');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`SKILL.md not found in ${localPath}`);
  }

  const manifest = parseSkillMd(manifestPath);
  const id = uuidv4();

  upsertSkill({
    id,
    name: manifest.name,
    github_url: `local://${manifest.name}`,
    local_path: localPath,
    enabled,
    manifest_json: manifest.raw,
  });

  return { id, name: manifest.name, localPath };
}

// ---------------------------------------------------------------------------
// Uninstall a skill (remove files + DB entry)
// ---------------------------------------------------------------------------
export function uninstallSkill(id: string): void {
  const skill = getSkill(id);
  if (!skill) throw new Error('Skill not found');

  if (fs.existsSync(skill.local_path)) {
    fs.rmSync(skill.local_path, { recursive: true, force: true });
  }
  deleteSkill(id);
}

// ---------------------------------------------------------------------------
// Install an MCP SERVER from a GitHub URL
// ---------------------------------------------------------------------------
export interface InstallMcpResult {
  id: string;
  name: string;
  localPath: string;
}

export interface McpInstallOptions {
  transport?: 'stdio' | 'sse';
  command?: string;       // e.g. 'node', 'python3'
  args?: string[];        // e.g. ['server.js']
  url?: string;           // for SSE transport
}

/** Extract a human-friendly name from an npx/bunx package argument.
 *  e.g. "@upstash/context7-mcp@latest" → "context7-mcp"
 *       "exa-mcp-server"               → "exa-mcp-server"
 *  Exported for tests.
 */
export function nameFromPackageArg(args: string[]): string {
  const pkg = args.find(a => !a.startsWith('-'));
  if (!pkg) return '';
  // Strip @scope/ prefix and @version suffix, then sanitize
  const bare = pkg.replace(/^@[^/]+\//, '').replace(/@.*$/, '');
  return bare.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
}

export function installMcpServer(githubUrl: string, options: McpInstallOptions = {}): InstallMcpResult {
  if (githubUrl) assertGithubRepoUrl(githubUrl);
  // Derive a safe name from either the GitHub URL or the command (for npx-based servers)
  const cmd  = options.command ?? '';
  const args = options.args ?? [];
  const repoName = githubUrl
    ? repoNameFromUrl(githubUrl)
    : ((cmd === 'npx' || cmd === 'bunx') ? nameFromPackageArg(args) : '') ||
      cmd.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase().replace(/^-+|-+$/g, '') ||
      'mcp';
  const localPath = githubUrl ? path.join(MCP_SERVERS_DIR, repoName) : '';

  if (githubUrl) {
    // Clone or pull
    if (fs.existsSync(localPath)) {
      execFileSync('git', ['-C', localPath, 'pull', '--ff-only'], { stdio: 'pipe' });
    } else {
      execFileSync('git', ['clone', '--depth=1', githubUrl, localPath], { stdio: 'pipe' });
    }

    // Install npm dependencies
    if (fs.existsSync(path.join(localPath, 'package.json'))) {
      execSync('npm install --omit=dev --ignore-scripts --no-audit', { cwd: localPath, stdio: 'pipe' });
    }
  }

  // Infer command from project structure if not provided
  let command = cmd;
  let finalArgs = args;

  if (!command && localPath && fs.existsSync(path.join(localPath, 'package.json'))) {
    // Try to read main entry from package.json
    const pkg = JSON.parse(fs.readFileSync(path.join(localPath, 'package.json'), 'utf-8'));
    const mainFile = pkg.main ?? 'index.js';
    command = 'node';
    finalArgs = [path.join(localPath, mainFile)];
  }

  // Use the repo name as the server name
  const name = repoName;
  // Reuse existing ID if a server with this name is already registered (prevents UNIQUE constraint failure on re-install)
  const existing = getDb().prepare('SELECT id FROM mcp_servers WHERE name = ?').get(name) as { id: string } | undefined;
  const id = existing?.id ?? uuidv4();

  upsertMcpServer({
    id,
    name,
    github_url: githubUrl,
    local_path: localPath,
    transport: options.transport ?? 'stdio',
    command,
    args_json: JSON.stringify(finalArgs),
    url: options.url ?? '',
    enabled: 1,
  });

  return { id, name, localPath };
}

// ---------------------------------------------------------------------------
// Uninstall an MCP server
// ---------------------------------------------------------------------------
export function uninstallMcpServer(id: string): void {
  const server = getMcpServer(id);
  if (!server) throw new Error('MCP server not found');

  if (fs.existsSync(server.local_path)) {
    fs.rmSync(server.local_path, { recursive: true, force: true });
  }
  deleteMcpServer(id);
}
