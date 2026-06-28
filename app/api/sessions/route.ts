import { listSessions, createSession, deleteSession, updateSessionAgent, updateSessionTitle, pinSessionChat, setPinnedPrompt, getFirstUserMessage, updateSessionPreviewState } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

// GET /api/sessions – list all sessions
export async function GET() {
  const sessions = listSessions();
  return NextResponse.json({ sessions });
}

// POST /api/sessions – create a new session
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { title = 'New Chat', agentName = 'main' } = body as { title?: string; agentName?: string };
  const session = createSession(uuidv4(), title, agentName);
  return NextResponse.json({ session }, { status: 201 });
}

// DELETE /api/sessions?id=<id> – delete a session and all its messages
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteSession(id);
  return NextResponse.json({ ok: true });
}

// PATCH /api/sessions – update a session's agent_name and/or title and/or pin state
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { id, agentName, title, pinChat, pinPrompt, previewState } = body as {
    id?: string;
    agentName?: string;
    title?: string;
    pinChat?: boolean;
    pinPrompt?: boolean;
    previewState?: unknown;
  };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (agentName) updateSessionAgent(id, agentName);
  if (title !== undefined) updateSessionTitle(id, title.trim() || 'New Chat');
  if (pinChat !== undefined) pinSessionChat(id, pinChat);
  if (pinPrompt === true) {
    const text = getFirstUserMessage(id);
    setPinnedPrompt(id, text);
  } else if (pinPrompt === false) {
    setPinnedPrompt(id, null);
  }
  if (previewState !== undefined) updateSessionPreviewState(id, JSON.stringify(previewState));
  return NextResponse.json({ ok: true });
}
