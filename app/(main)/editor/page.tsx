'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import CodeEditorPanel from '@/components/CodeEditorPanel';
import { Loader2, FolderOpen } from 'lucide-react';

function EditorContent() {
  // useSearchParams must be inside a Suspense boundary (Next.js 14+ requirement).
  // Extracting this into a child component lets us wrap only the params-dependent
  // code in Suspense rather than the entire page.
  const params = useSearchParams();
  const folder = params.get('folder') ?? '';

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header — amber gradient with decorative semi-transparent circles.
            The overlapping circles create a subtle depth effect behind the title.
            Each page uses a distinct header color (Settings: blue, Editor: amber). */}
        <div className="bg-amber-600 pl-14 pr-6 py-6 md:px-8 md:py-10 relative overflow-hidden flex-shrink-0">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full translate-x-1/3 -translate-y-1/3" />
          <div className="absolute top-0 left-0 w-40 h-40 bg-white/10 rounded-full -translate-x-1/4 -translate-y-1/3" />
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 min-w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <FolderOpen size={24} className="text-white" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <h1 className="text-3xl font-800 text-white tracking-tight truncate">Agent Files</h1>
                <p className="text-rose-100 text-sm truncate">Browse and edit files in the agent data directory</p>
              </div>
            </div>
          </div>
        </div>
        <CodeEditorPanel initialFolder={folder} className="flex-1" />
      </main>
  );
}

export default function EditorPage() {
  return (
    // Suspense boundary: useSearchParams triggers async client-side resolution
    // of URL search parameters. Next.js requires a Suspense boundary around any
    // component that calls useSearchParams — without it you get a build error.
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center text-gray-400 gap-2">
        <Loader2 size={20} className="animate-spin" /> Loading editor…
      </div>
    }>
      <EditorContent />
    </Suspense>
  );
}
