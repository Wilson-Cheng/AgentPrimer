import { getMcpServer, listMcpServers, setMcpServerEnabled, upsertMcpServer } from '@/lib/db';
import { installMcpServer, sanitizeEnvInput, uninstallMcpServer } from '@/lib/installer';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function parseEnvJson(envJson: string): { env: Record<string, string>; parseError: boolean } {
  try {
    const raw = JSON.parse(envJson || '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return { env: raw as Record<string, string>, parseError: false };
    }
  } catch {
    // handled below
  }
  return { env: {}, parseError: true };
}

export async function GET() {
  const servers = listMcpServers();
  // Mask env values so the credentials don't ride back to the browser on
  // every load of the Skills/MCP page. The client only needs to know which
  // keys are set, not the literal values. A malformed env_json is surfaced
  // via `env_parse_error: true` so the UI can prompt the operator to
  // re-enter rather than silently render "no env vars set".
  const masked = servers.map((s) => {
    const { env, parseError } = parseEnvJson(s.env_json);
    const envKeys = Object.keys(env).sort();
    return { ...s, env_keys: envKeys, env_parse_error: parseError };
  });
  return NextResponse.json({ servers: masked });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { githubUrl, transport, command, args, url, env } = body as {
    githubUrl?: string;
    transport?: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  };

  if (!githubUrl && !command && transport !== 'sse') {
    return NextResponse.json({ error: 'Provide a GitHub URL or a command (e.g. npx)' }, { status: 400 });
  }
  if (!githubUrl && transport === 'sse' && !url) {
    return NextResponse.json({ error: 'Provide a GitHub URL or a server URL for SSE transport' }, { status: 400 });
  }

  // Split "npx -y pkg@latest" style command strings into command + args
  let parsedCommand = command ?? '';
  let parsedArgs = args ?? [];
  if (parsedCommand && parsedArgs.length === 0) {
    const parts = parsedCommand.split(/\s+/).filter(Boolean);
    parsedCommand = parts[0] ?? '';
    parsedArgs = parts.slice(1);
  }

  try {
    const result = installMcpServer(githubUrl ?? '', {
      transport,
      command: parsedCommand,
      args: parsedArgs,
      url,
      env,
    });
    return NextResponse.json({ ok: true, server: result }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    uninstallMcpServer(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { id, enabled, name, transport, command, args, url, env, envPatch } = body as {
    id?: string;
    enabled?: boolean;
    name?: string;
    transport?: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    /** Replace the entire per-server env map after sanitisation. */
    env?: Record<string, string>;
    /** Merge these key/value pairs into the existing per-server env map. */
    envPatch?: Record<string, string>;
  };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = getMcpServer(id);
  if (!existing) return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });

  const hasSettingsUpdate =
    name !== undefined ||
    transport !== undefined ||
    command !== undefined ||
    args !== undefined ||
    url !== undefined ||
    env !== undefined ||
    envPatch !== undefined;
  if (!hasSettingsUpdate) {
    if (enabled === undefined) return NextResponse.json({ error: 'enabled or settings required' }, { status: 400 });
    setMcpServerEnabled(id, enabled);
    return NextResponse.json({ ok: true });
  }

  const nextTransport = transport ?? existing.transport;
  const nextCommand = command ?? existing.command;
  const nextArgs = args ?? JSON.parse(existing.args_json || '[]');
  const nextUrl = url ?? existing.url;

  // Per-server env semantics:
  //   • `env` absent and `envPatch` absent → keep existing env_json untouched.
  //   • `env` object                       → REPLACE the entire env map.
  //   • `envPatch` object                  → MERGE into existing env map.
  // The setup wizard uses `envPatch` so saving EXA_API_KEY cannot wipe any
  // operator-added Exa env vars. The edit dialog uses `env` because its copy
  // says "typing at least one line replaces the saved map".
  //
  // We deliberately do NOT clear env_json when the transport toggles to
  // `sse`. SSE servers don't get env forwarded by `lib/mcp-client.ts`
  // anyway (no subprocess), and preserving the saved values means a
  // user who accidentally flips stdio↔sse↔stdio doesn't lose their
  // credentials in the process. However, writing NEW env vars to an SSE
  // server is rejected below so the UI/API cannot create "ghost" creds that
  // are saved but never used.
  const existingEnv = parseEnvJson(existing.env_json).env;
  const cleanEnv = env === undefined ? undefined : sanitizeEnvInput(env);
  const cleanEnvPatch = envPatch === undefined ? undefined : sanitizeEnvInput(envPatch);
  if (nextTransport === 'sse' && cleanEnv && Object.keys(cleanEnv).length > 0) {
    return NextResponse.json({ error: 'env vars are only supported for stdio MCP servers' }, { status: 400 });
  }
  if (nextTransport === 'sse' && cleanEnvPatch && Object.keys(cleanEnvPatch).length > 0) {
    return NextResponse.json({ error: 'env vars are only supported for stdio MCP servers' }, { status: 400 });
  }
  const nextEnvJson =
    cleanEnv !== undefined
      ? JSON.stringify(cleanEnv)
      : cleanEnvPatch !== undefined
        ? JSON.stringify({ ...existingEnv, ...cleanEnvPatch })
        : existing.env_json || '{}';

  if (nextTransport === 'stdio' && !nextCommand) {
    return NextResponse.json({ error: 'command required for stdio MCP servers' }, { status: 400 });
  }
  if (nextTransport === 'sse' && !nextUrl) {
    return NextResponse.json({ error: 'url required for SSE MCP servers' }, { status: 400 });
  }

  upsertMcpServer({
    ...existing,
    name: typeof name === 'string' && name.trim() ? name.trim() : existing.name,
    transport: nextTransport,
    command: nextTransport === 'stdio' ? nextCommand : '',
    args_json: nextTransport === 'stdio' ? JSON.stringify(nextArgs) : '[]',
    url: nextTransport === 'sse' ? nextUrl : '',
    enabled: enabled === undefined ? existing.enabled : enabled ? 1 : 0,
    env_json: nextEnvJson,
  });
  return NextResponse.json({ ok: true });
}
