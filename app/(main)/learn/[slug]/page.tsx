import { notFound } from 'next/navigation';
import LessonPlayer from '@/components/learn/LessonPlayer';
import { getLesson, getNextLesson, getPreviousLesson, LESSONS } from '@/lib/learn-curriculum';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return LESSONS.map(lesson => ({ slug: lesson.slug }));
}

export default async function LessonPage({ params }: Props) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) notFound();

  return (
    <LessonPlayer
      lesson={lesson}
      previousLesson={getPreviousLesson(slug)}
      nextLesson={getNextLesson(slug)}
    />
  );
}
