import { listAgentNames, parseAgentsConfig, readAgent, writeAgent, MAIN_AGENT_NAME } from '@/lib/memory';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const agentName = request.nextUrl.searchParams.get('agent') || undefined;
  const agents = listAgentNames();
  const agentConfigs = parseAgentsConfig().map(a => ({
    name: a.name,
    model: a.model ?? null,
  }));
  const activeAgent = agentName && agents.includes(agentName) ? agentName : agents[0] ?? MAIN_AGENT_NAME;
  return NextResponse.json({
    content: readAgent(activeAgent),
    agentName: activeAgent,
    agents,
    agentConfigs,
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.content !== 'string') return NextResponse.json({ error: 'content required' }, { status: 400 });
  const agentName = typeof body.agentName === 'string' && body.agentName.trim() ? body.agentName : MAIN_AGENT_NAME;
  writeAgent(agentName, body.content);
  return NextResponse.json({ ok: true });
}
