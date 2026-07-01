'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  FlaskConical,
} from 'lucide-react';
import MarkdownContent from '@/components/MarkdownContent';
import type { Lesson } from '@/lib/learn-curriculum';

interface LessonProgress {
  lesson_slug: string;
  status: 'not_started' | 'in_progress' | 'completed';
  quiz_score: number | null;
  quiz_total: number | null;
}

export default function LessonPlayer({
  lesson,
  previousLesson,
  nextLesson,
}: {
  lesson: Lesson;
  previousLesson?: Lesson;
  nextLesson?: Lesson;
}) {
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const score = useMemo(
    () =>
      lesson.questions.reduce(
        (sum, question) => sum + (answers[question.id] === question.answer ? 1 : 0),
        0,
      ),
    [answers, lesson.questions],
  );
  const allAnswered = lesson.questions.every((question) => answers[question.id] !== undefined);
  const completed = progress?.status === 'completed';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/learn/progress')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const row =
          (data.progress ?? []).find((item: LessonProgress) => item.lesson_slug === lesson.slug) ??
          null;
        setProgress(row);
        if (!row) {
          fetch('/api/learn/progress', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonSlug: lesson.slug, status: 'in_progress' }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (!cancelled) setProgress(d.progress);
            })
            .catch(() => {});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lesson.slug]);

  const submitQuiz = async () => {
    setSubmitted(true);
    setSaving(true);
    try {
      const res = await fetch('/api/learn/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonSlug: lesson.slug,
          status: 'completed',
          quizScore: score,
          quizTotal: lesson.questions.length,
        }),
      });
      const data = await res.json();
      if (res.ok) setProgress(data.progress);
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/learn/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonSlug: lesson.slug, status: 'completed' }),
      });
      const data = await res.json();
      if (res.ok) setProgress(data.progress);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#f8f8f8] dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-5 py-6">
        <Link
          href="/learn"
          className="inline-flex items-center gap-2 text-sm font-700 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-300 mb-5"
        >
          <ArrowLeft size={16} />
          Back to curriculum
        </Link>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          <article className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 md:p-8 space-y-8">
            <header className="space-y-4 pb-6 border-b border-gray-100 dark:border-gray-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-800">
                  {lesson.module}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-800">
                  {lesson.level}
                </span>
                <span className="text-xs font-700 text-gray-500 dark:text-gray-400">
                  {lesson.estimatedMinutes} min
                </span>
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-900 text-gray-900 dark:text-white tracking-tight">
                  {lesson.title}
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400 max-w-3xl">{lesson.summary}</p>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {lesson.objectives.map((objective) => (
                  <div
                    key={objective}
                    className="flex items-start gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    {objective}
                  </div>
                ))}
              </div>
            </header>

            <MarkdownContent className="prose prose-gray dark:prose-invert max-w-none">
              {lesson.content}
            </MarkdownContent>

            <section className="space-y-4 pt-6 border-t border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-xl font-900 text-gray-900 dark:text-white">
                  Guided experiments
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Open the live app area, try the task, then return here to continue.
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {lesson.experiments.map((experiment) => (
                  <div
                    key={experiment.title}
                    className="border border-gray-100 dark:border-gray-800 rounded-xl p-4 bg-gray-50 dark:bg-gray-950 space-y-3"
                  >
                    <div className="flex items-center gap-2 font-800 text-gray-900 dark:text-white">
                      <FlaskConical size={16} className="text-blue-500" />
                      {experiment.title}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {experiment.instructions}
                    </p>
                    <a
                      href={experiment.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 text-sm font-700 text-gray-700 dark:text-gray-200 transition-colors"
                    >
                      {experiment.cta}
                      <ExternalLink size={14} />
                    </a>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4 pt-6 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-900 text-gray-900 dark:text-white">Quick quiz</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Answer every question to complete the lesson.
                  </p>
                </div>
                {completed && (
                  <span className="px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm font-800">
                    Completed{' '}
                    {progress?.quiz_total ? `${progress.quiz_score}/${progress.quiz_total}` : ''}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {lesson.questions.map((question, questionIndex) => (
                  <div
                    key={question.id}
                    className="border border-gray-100 dark:border-gray-800 rounded-xl p-4 bg-white dark:bg-gray-900"
                  >
                    <p className="font-800 text-gray-900 dark:text-white mb-3">
                      {questionIndex + 1}. {question.prompt}
                    </p>
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => {
                        const selected = answers[question.id] === optionIndex;
                        const correct = submitted && optionIndex === question.answer;
                        const wrong = submitted && selected && optionIndex !== question.answer;
                        return (
                          <button
                            key={option}
                            type="button"
                            disabled={submitted}
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))
                            }
                            className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg border transition-colors text-sm ${correct ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-200' : wrong ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200' : selected ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-200' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-500'}`}
                          >
                            {selected ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    {submitted && (
                      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                        {question.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {submitted
                    ? `Score: ${score}/${lesson.questions.length}`
                    : 'Complete the quiz to save progress.'}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={markComplete}
                    disabled={saving || completed}
                    className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 text-sm font-800 transition-colors"
                  >
                    Mark complete
                  </button>
                  <button
                    type="button"
                    onClick={submitQuiz}
                    disabled={!allAnswered || saving || submitted}
                    className="h-10 px-4 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-800 transition-colors"
                  >
                    Submit quiz
                  </button>
                </div>
              </div>
            </section>

            <nav className="flex items-center justify-between gap-4 pt-6 border-t border-gray-100 dark:border-gray-800">
              {previousLesson ? (
                <Link
                  href={`/learn/${previousLesson.slug}`}
                  className="inline-flex items-center gap-2 text-sm font-800 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-300"
                >
                  <ArrowLeft size={16} />
                  {previousLesson.title}
                </Link>
              ) : (
                <span />
              )}
              {nextLesson ? (
                <Link
                  href={`/learn/${nextLesson.slug}`}
                  className="inline-flex items-center gap-2 text-sm font-800 text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200"
                >
                  {nextLesson.title}
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <Link
                  href="/learn"
                  className="inline-flex items-center gap-2 text-sm font-800 text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200"
                >
                  Finish curriculum
                  <ArrowRight size={16} />
                </Link>
              )}
            </nav>
          </article>

          <aside className="lg:sticky lg:top-6 space-y-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 space-y-4">
              <h2 className="font-900 text-gray-900 dark:text-white">Lesson checklist</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Read the lesson
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Run an experiment
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <CheckCircle2
                    size={16}
                    className={completed ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-700'}
                  />{' '}
                  Complete quiz
                </div>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-5">
              <h2 className="font-900 text-blue-900 dark:text-blue-100">Learning tip</h2>
              <p className="text-sm text-blue-800/80 dark:text-blue-200/80 mt-2">
                Keep this lesson open in one tab and experiment in another. The fastest way to learn
                agents is to inspect what actually happens.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
