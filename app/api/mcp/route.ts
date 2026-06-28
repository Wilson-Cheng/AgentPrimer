import { getMcpServer, listMcpServers, setMcpServerEnabled, upsertMcpServer } from '@/lib/db';
import { installMcpServer, uninstallMcpServer } from '@/lib/installer';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const servers = listMcpServers();
  return NextResponse.json({ servers });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { githubUrl, transport, command, args, url } = body as {
    githubUrl?: string;
    transport?: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
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
    const result = installMcpServer(githubUrl ?? '', { transport, command: parsedCommand, args: parsedArgs, url });
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
  const { id, enabled, name, transport, command, args, url } = body as {
    id?: string;
    enabled?: boolean;
    name?: string;
    transport?: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
  };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = getMcpServer(id);
  if (!existing) return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });

  const hasSettingsUpdate = name !== undefined || transport !== undefined || command !== undefined || args !== undefined || url !== undefined;
  if (!hasSettingsUpdate) {
    if (enabled === undefined) return NextResponse.json({ error: 'enabled or settings required' }, { status: 400 });
    setMcpServerEnabled(id, enabled);
    return NextResponse.json({ ok: true });
  }

  const nextTransport = transport ?? existing.transport;
  const nextCommand = command ?? existing.command;
  const nextArgs = args ?? JSON.parse(existing.args_json || '[]');
  const nextUrl = url ?? existing.url;

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
  });
  return NextResponse.json({ ok: true });
}
