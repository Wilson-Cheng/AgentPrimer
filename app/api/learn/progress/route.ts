import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getLesson } from '@/lib/learn-curriculum';
import { listLessonProgress, upsertLessonProgress } from '@/lib/db';

export const runtime = 'nodejs';

type Status = 'not_started' | 'in_progress' | 'completed';

export async function GET() {
  const username = await getSessionUser();
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ progress: listLessonProgress(username) });
}

export async function PATCH(request: NextRequest) {
  const username = await getSessionUser();
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    lessonSlug?: string;
    status?: Status;
    quizScore?: number;
    quizTotal?: number;
  } | null;

  const lessonSlug = body?.lessonSlug?.trim();
  const status = body?.status;
  if (!lessonSlug || !getLesson(lessonSlug)) {
    return NextResponse.json({ error: 'Unknown lesson' }, { status: 400 });
  }
  if (!status || !['not_started', 'in_progress', 'completed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const quizScore =
    typeof body?.quizScore === 'number' ? Math.max(0, Math.floor(body.quizScore)) : null;
  const quizTotal =
    typeof body?.quizTotal === 'number' ? Math.max(0, Math.floor(body.quizTotal)) : null;
  const progress = upsertLessonProgress(username, lessonSlug, status, quizScore, quizTotal);

  return NextResponse.json({ progress });
}
