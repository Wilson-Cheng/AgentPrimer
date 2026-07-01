import { NextRequest, NextResponse } from 'next/server';
import {
  grantApproval,
  listPermanentApprovals,
  revokePermanentApproval,
} from '@/lib/approval-store';
import type { ApprovalOperation, ApprovalScope } from '@/lib/approval-store';

export const runtime = 'nodejs';

// POST /api/approval – grant an approval
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { sessionId, operation, scope, filePath } = body as {
    sessionId?: string;
    operation?: ApprovalOperation;
    scope?: ApprovalScope;
    filePath?: string;
  };

  if (!sessionId || !operation || !scope) {
    return NextResponse.json(
      { error: 'sessionId, operation, and scope are required' },
      { status: 400 },
    );
  }

  grantApproval(sessionId, operation, scope, filePath);
  return NextResponse.json({ ok: true, operation, scope });
}

// GET /api/approval – list permanent approvals
export async function GET() {
  return NextResponse.json({ permanent: listPermanentApprovals() });
}

// DELETE /api/approval?operation=<op> – revoke a permanent approval
export async function DELETE(request: NextRequest) {
  const operation = request.nextUrl.searchParams.get('operation') as ApprovalOperation | null;
  if (!operation) return NextResponse.json({ error: 'operation required' }, { status: 400 });
  revokePermanentApproval(operation);
  return NextResponse.json({ ok: true });
}
