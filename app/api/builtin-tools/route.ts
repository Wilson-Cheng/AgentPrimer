import { NextRequest, NextResponse } from 'next/server';
import { listBuiltinToolsWithState, setBuiltinToolEnabled } from '@/lib/builtin-tools-registry';

export const runtime = 'nodejs';

// GET /api/builtin-tools – list all built-in tools with enabled state
export async function GET() {
  return NextResponse.json({ tools: listBuiltinToolsWithState() });
}

// PATCH /api/builtin-tools – enable or disable a built-in tool
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { id, enabled } = body as { id?: string; enabled?: boolean };

  if (!id || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'id and enabled are required' }, { status: 400 });
  }

  setBuiltinToolEnabled(id, enabled);
  return NextResponse.json({ ok: true, id, enabled });
}
