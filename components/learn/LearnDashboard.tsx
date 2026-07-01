'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, CheckCircle2, Clock, PlayCircle, Trophy } from 'lucide-react';
import type { Lesson } from '@/lib/learn-curriculum';

interface LessonProgress {
  lesson_slug: string;
  status: 'not_started' | 'in_progress' | 'completed';
  quiz_score: number | null;
  quiz_total: number | null;
}

export default function LearnDashboard({ lessons }: { lessons: Lesson[] }) {
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});
  const [loading, setLoading] = useState(true);
  const [showLearnNav, setShowLearnNav] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/learn/progress')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const map = Object.fromEntries(
          (data.progress ?? []).map((row: LessonProgress) => [row.lesson_slug, row]),
        );
        setProgress(map);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    fetch('/api/ui-settings')
      .then((r) => r.json())
      .then((d: Record<string, unknown>) => {
        if (!cancelled && d.show_learn_nav !== undefined)
          setShowLearnNav(d.show_learn_nav !== false);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const completed = lessons.filter(
    (lesson) => progress[lesson.slug]?.status === 'completed',
  ).length;
  const percent = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const nextLesson =
    lessons.find((lesson) => progress[lesson.slug]?.status !== 'completed') ?? lessons[0];

  const setLearnNavVisible = async (visible: boolean) => {
    setShowLearnNav(visible);
    await fetch('/api/ui-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_learn_nav: visible }),
    });
    window.dispatchEvent(
      new CustomEvent('ui-settings-changed', { detail: { show_learn_nav: visible } }),
    );
  };

  const modules = useMemo(() => {
    const grouped: Record<string, Lesson[]> = {};
    for (const lesson of lessons) {
      grouped[lesson.module] ??= [];
      grouped[lesson.module].push(lesson);
    }
    return Object.entries(grouped);
  }, [lessons]);

  return (
    <main className="flex-1 overflow-y-auto bg-[#f8f8f8] dark:bg-gray-950">
      <div className="max-w-6xl mx-auto px-5 py-8 space-y-8">
        <section className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 text-sm font-700">
                <BookOpen size={15} />
                In-app training curriculum
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-900 text-gray-900 dark:text-white tracking-tight">
                  Learn agent engineering by experimenting
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 max-w-2xl">
                  Follow guided lessons, run experiments in the live app, complete quick quizzes,
                  and track your progress.
                </p>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 min-w-[240px] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-700 text-gray-600 dark:text-gray-400">Progress</span>
                <span className="text-2xl font-900 text-gray-900 dark:text-white">
                  {loading ? '—' : `${percent}%`}
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {completed} of {lessons.length} lessons completed
              </p>
              {nextLesson && (
                <Link
                  href={`/learn/${nextLesson.slug}`}
                  className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-700 transition-colors"
                >
                  <PlayCircle size={16} />
                  {completed === 0 ? 'Start curriculum' : 'Continue'}
                </Link>
              )}
              {completed === lessons.length && !loading && (
                <label className="flex items-start gap-2 pt-1 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!showLearnNav}
                    onChange={(e) => setLearnNavVisible(!e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span>Hide Learn from the sidebar now that I completed the curriculum.</span>
                </label>
              )}
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5">
            <Clock size={18} className="text-blue-500 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Total time</p>
            <p className="text-2xl font-900 text-gray-900 dark:text-white">
              {lessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0)} min
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5">
            <Trophy size={18} className="text-amber-500 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Lessons</p>
            <p className="text-2xl font-900 text-gray-900 dark:text-white">{lessons.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5">
            <CheckCircle2 size={18} className="text-emerald-500 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Completed</p>
            <p className="text-2xl font-900 text-gray-900 dark:text-white">{completed}</p>
          </div>
        </section>

        <section className="space-y-5">
          {modules.map(([module, moduleLessons]) => (
            <div key={module} className="space-y-3">
              <h2 className="text-lg font-900 text-gray-900 dark:text-white">{module}</h2>
              <div className="grid gap-3">
                {moduleLessons.map((lesson, index) => {
                  const row = progress[lesson.slug];
                  const status = row?.status ?? 'not_started';
                  return (
                    <Link
                      key={lesson.slug}
                      href={`/learn/${lesson.slug}`}
                      className="group bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-500/60 rounded-xl p-5 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                        <div className="flex items-start gap-4">
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-900 ${status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
                          >
                            {status === 'completed' ? <CheckCircle2 size={18} /> : index + 1}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h3 className="font-900 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300">
                                {lesson.title}
                              </h3>
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-700">
                                {lesson.level}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
                              {lesson.summary}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 md:text-right">
                          <span>{lesson.estimatedMinutes} min</span>
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-800 ${status === 'completed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : status === 'in_progress' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}
                          >
                            {status === 'completed'
                              ? 'Completed'
                              : status === 'in_progress'
                                ? 'In progress'
                                : 'Not started'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
