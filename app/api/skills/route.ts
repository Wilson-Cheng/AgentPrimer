import { listSkills, setSkillEnabled } from '@/lib/db';
import { installSkill, installLocalSkill, uninstallSkill } from '@/lib/installer';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isInsideRoot } from '@/lib/path-security';

export const runtime = 'nodejs';

const SKILLS_ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'data', 'skills');

// GET /api/skills – list all registered + discovered SKILL.md skills
export async function GET() {
  // Registered skills from DB
  const registered = listSkills().map((s) => {
    // manifest_json now stores the raw SKILL.md content (not JSON).
    // Extract basic info via frontmatter regex so it displays correctly.
    let name = s.name;
    let description = '';
    const bodyMatch = s.manifest_json.match(/^---\n([\s\S]+?)\n---/);
    if (bodyMatch) {
      const fm = bodyMatch[1];
      const nMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      const dMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
      if (nMatch) name = nMatch[1].trim();
      if (dMatch) description = dMatch[1].trim();
    }
    return {
      id: s.id,
      name,
      github_url: s.github_url,
      local_path: s.local_path,
      enabled: s.enabled,
      registered: true,
      description,
      manifest_preview: s.manifest_json.slice(0, 500), // preview for the UI
      type: 'skill',
      source: s.github_url.startsWith('builtin:') ? 'built-in' : 'installed',
      // The full SKILL.md content is loaded separately via the Tool Playground
    };
  });

  // Discover unregistered skills in data/skills/<name>/SKILL.md
  const registeredPaths = new Set(listSkills().map((s) => s.local_path));
  const skillsDir = path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'skills');
  const discovered: Array<Record<string, unknown>> = [];

  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(skillsDir, entry.name);
      if (registeredPaths.has(dir)) continue;
      const mdPath = path.join(dir, 'SKILL.md');
      if (!fs.existsSync(mdPath)) continue;
      try {
        const raw = fs.readFileSync(mdPath, 'utf-8');
        const fmMatch = raw.match(/^---\n([\s\S]+?)\n---/);
        let name = entry.name;
        let description = '';
        if (fmMatch) {
          const fm = fmMatch[1];
          const nMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m);
          const dMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
          if (nMatch) name = nMatch[1].trim();
          if (dMatch) description = dMatch[1].trim();
        }
        discovered.push({
          id: null,
          name,
          description,
          github_url: `local://${name}`,
          local_path: dir,
          enabled: 0,
          manifest_preview: raw.slice(0, 500),
          type: 'skill',
          source: 'discovered',
        });
      } catch {
        // skip unreadable skill directories
      }
    }
  }

  const all = [...registered, ...discovered];
  all.sort((a, b) => (a.name as string).localeCompare(b.name as string));
  return NextResponse.json({ skills: all });
}

// POST /api/skills – install a skill from GitHub or register a local directory
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { githubUrl, localPath, enabled } = body as {
    githubUrl?: string;
    localPath?: string;
    enabled?: boolean;
  };

  if (localPath) {
    const resolved = path.resolve(localPath);
    if (!isInsideRoot(SKILLS_ROOT, resolved)) {
      return NextResponse.json(
        { error: 'Local skills must be inside data/skills' },
        { status: 403 },
      );
    }

    const skillMdPath = path.join(resolved, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      return NextResponse.json({ error: `No SKILL.md found in ${localPath}` }, { status: 422 });
    }

    try {
      const result = installLocalSkill(resolved, enabled ? 1 : 0);
      return NextResponse.json({ ok: true, skill: result }, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 422 });
    }
  }

  if (!githubUrl)
    return NextResponse.json({ error: 'githubUrl or localPath is required' }, { status: 400 });

  try {
    const result = installSkill(githubUrl);
    return NextResponse.json({ ok: true, skill: result }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}

// DELETE /api/skills?id=<id> – uninstall a skill
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    uninstallSkill(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}

// PATCH /api/skills – toggle enabled/disabled
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { id, enabled } = body as { id?: string; enabled?: boolean };
  if (!id || enabled === undefined)
    return NextResponse.json({ error: 'id and enabled required' }, { status: 400 });
  setSkillEnabled(id, enabled);
  return NextResponse.json({ ok: true });
}
