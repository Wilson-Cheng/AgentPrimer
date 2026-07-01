'use client';

/**
 * components/WritingGuideModal.tsx
 * ---------------------------------------------------------------------------
 * Educational popup explaining how to write `system.md`, `agent.md`, and
 * `memory.md` so the AgentPrimer parser can read them correctly.
 *
 * Triggered from the "How to write this file" button on the right side of
 * the info banner in /agents. Each file has its own guide section (rules
 * the parser actually enforces + a minimal copy-paste example), so users
 * don't have to dig through source code or docs to learn the format.
 */

import { useEffect } from 'react';
import { Book, X, FileText, Brain } from 'lucide-react';

export type GuideFile = 'system.md' | 'agent.md' | 'memory.md';

export default function WritingGuideModal({
  file,
  onClose,
}: {
  file: GuideFile;
  onClose: () => void;
}) {
  // Escape closes the modal — matches the rest of the app's modal behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const guide = GUIDES[file];

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg min-w-9 bg-amber-500 flex items-center justify-center">
              <Book size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-700 text-gray-900 dark:text-gray-100">How to write {file}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{guide.tagline}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {guide.sections.map((s, i) => (
            <GuideSection key={i} section={s} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-400 dark:text-gray-500 flex-shrink-0">
          Edits take effect on the next chat message — no restart needed.
        </div>
      </div>
    </div>
  );
}

// ── Section types & renderer ─────────────────────────────────────────────────

type Section =
  | { kind: 'intro'; body: React.ReactNode }
  | { kind: 'rules'; title: string; items: React.ReactNode[] }
  | {
      kind: 'fields';
      title: string;
      rows: Array<{ name: string; required: boolean; description: React.ReactNode }>;
    }
  | { kind: 'example'; title: string; code: string };

function GuideSection({ section }: { section: Section }) {
  switch (section.kind) {
    case 'intro':
      return <div>{section.body}</div>;

    case 'rules':
      return (
        <div>
          <h3 className="font-700 text-gray-900 dark:text-gray-100 mb-2">{section.title}</h3>
          <ul className="space-y-1.5 list-disc list-inside marker:text-amber-500">
            {section.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      );

    case 'fields':
      return (
        <div>
          <h3 className="font-700 text-gray-900 dark:text-gray-100 mb-2">{section.title}</h3>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-3 py-2 font-600">Field</th>
                  <th className="text-left px-3 py-2 font-600 w-20">Required</th>
                  <th className="text-left px-3 py-2 font-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {section.rows.map((r) => (
                  <tr key={r.name}>
                    <td className="px-3 py-2 align-top">
                      <code className="font-mono text-violet-600 dark:text-violet-400">
                        {r.name}
                      </code>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {r.required ? (
                        <span className="text-amber-600 dark:text-amber-400 font-600">yes</span>
                      ) : (
                        <span className="text-gray-400">no</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">
                      {r.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'example':
      return (
        <div>
          <h3 className="font-700 text-gray-900 dark:text-gray-100 mb-2">{section.title}</h3>
          <pre className="text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700 overflow-x-auto">
            {section.code}
          </pre>
        </div>
      );
  }
}

// ── Inline helpers used in guides ────────────────────────────────────────────

const C = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono text-sm">
    {children}
  </code>
);

// ── Per-file content ─────────────────────────────────────────────────────────

interface Guide {
  tagline: string;
  sections: Section[];
}

const GUIDES: Record<GuideFile, Guide> = {
  // ───────────────────────────────────────────────────────────────────────────
  'system.md': {
    tagline: 'Free-form global system prompt',
    sections: [
      {
        kind: 'intro',
        body: (
          <p>
            <FileText size={14} className="inline -mt-1 mr-1 text-amber-500" />
            <strong>system.md</strong> is the <strong>global base</strong> of every agent&apos;s
            system prompt. It&apos;s prepended <em>before</em> any agent-specific prompt from{' '}
            <C>agent.md</C>. Use it for rules that should apply to <em>every</em> agent regardless
            of role.
          </p>
        ),
      },
      {
        kind: 'rules',
        title: 'Parser rules',
        items: [
          <>
            <strong>No structure required.</strong> Markdown body is sent to the model as-is — no
            headings, fields, or special syntax are parsed.
          </>,
          <>
            Loaded by <C>readSystemPrompt()</C> and inserted at the top of the composed prompt on
            every turn.
          </>,
          <>
            Concatenated with the active agent&apos;s prompt using <C>---</C> as a separator.
          </>,
          <>Empty file is fine — the agent will just use its own prompt + built-in sections.</>,
        ],
      },
      {
        kind: 'rules',
        title: 'Writing tips',
        items: [
          <>Keep it short. Every token here gets sent on every turn for every agent.</>,
          <>Good fit: house style, refusal policy, output conventions, tone, formatting rules.</>,
          <>
            Bad fit: role-specific instructions (those belong in <C>agent.md</C>) or facts the agent
            should remember across sessions (those belong in that agent&apos;s <C>memory.md</C>).
          </>,
          <>
            You can use Markdown freely — <C>##</C> subheadings, bullet lists, code blocks — none of
            it is parsed specially.
          </>,
        ],
      },
      {
        kind: 'example',
        title: 'Minimal example',
        code: `You are a helpful, concise AI assistant.

## General rules
- Prefer minimal, targeted answers.
- When unsure, say so instead of guessing.
- Use Markdown for any code or list.
`,
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  'agent.md': {
    tagline: 'Agent-specific behavior, tools, model, and optional schema',
    sections: [
      {
        kind: 'intro',
        body: (
          <p>
            <Brain size={14} className="inline -mt-1 mr-1 text-amber-500" />
            <strong>agent.md</strong> lives at <C>data/agents/&lt;agent&gt;/agent.md</C> and defines
            one selectable agent. This file is where you teach an agent to behave differently from
            the others: its role, workflow, tool access, model preference, and optional structured
            output schema.
          </p>
        ),
      },
      {
        kind: 'rules',
        title: 'File and parser rules',
        items: [
          <>
            The first <C># </C> heading is the agent name shown in the picker. Keep it aligned with
            the folder name, e.g. <C>data/agents/coder/agent.md</C> starts with <C># coder</C>.
          </>,
          <>
            The parser reads labeled fields such as <C>**System Prompt:**</C>, <C>**Tools:**</C>,{' '}
            <C>**Model:**</C>, <C>**Output Schema:**</C>, and <C>**Output Schema File:**</C>.
          </>,
          <>
            <C>**System Prompt:**</C> may span multiple lines and include Markdown headings. It ends
            at the next recognized field.
          </>,
          <>
            Each agent has its own neighboring memory file at{' '}
            <C>data/agents/&lt;agent&gt;/memory.md</C>.
          </>,
          <>
            If the requested agent is missing, AgentPrimer falls back to the <C>main</C> agent.
          </>,
        ],
      },
      {
        kind: 'fields',
        title: 'Fields',
        rows: [
          {
            name: '# AgentName',
            required: true,
            description: (
              <>
                The agent identifier. Prefer lowercase names with hyphens, such as{' '}
                <C>code-reviewer</C>.
              </>
            ),
          },
          {
            name: '**System Prompt:**',
            required: true,
            description: (
              <>
                The agent&apos;s role, operating style, workflow, and behavior rules. This is the
                main place to make agents meaningfully different.
              </>
            ),
          },
          {
            name: '**Tools:**',
            required: false,
            description: (
              <>
                <C>all</C> grants every enabled tool. <C>none</C> grants no tools. A comma-separated
                list restricts this agent to specific tools, e.g. <C>read_file, search_files</C>.
                Non-schema agents default to <C>all</C>; schema agents default to <C>none</C>.
              </>
            ),
          },
          {
            name: '**Model:**',
            required: false,
            description: (
              <>
                Optional model override. Use <C>default</C> or omit the field to inherit Settings →
                Default Model.
              </>
            ),
          },
          {
            name: '**Output Schema:**',
            required: false,
            description: (
              <>
                Human-readable schema label followed by an optional description. Use with either an
                inline JSON fenced block or <C>**Output Schema File:**</C>.
              </>
            ),
          },
          {
            name: '**Output Schema File:**',
            required: false,
            description: (
              <>
                Relative path to a JSON schema inside the same agent folder, usually{' '}
                <C>schemas/output.json</C>. Paths outside the agent folder are rejected.
              </>
            ),
          },
        ],
      },
      {
        kind: 'rules',
        title: 'Writing tips',
        items: [
          <>
            Be specific about behavior, not just personality. Describe the agent&apos;s workflow,
            standards, when to use tools, and what a good answer looks like.
          </>,
          <>
            Use sections such as <C>## Workflow</C>, <C>## Output Style</C>,{' '}
            <C>## Memory Behavior</C>, and <C>## Boundaries</C> for more capable agents.
          </>,
          <>
            Keep global rules in <C>system.md</C>; keep role-specific rules here; keep durable facts
            and preferences in the agent&apos;s <C>memory.md</C>.
          </>,
          <>
            Restrict tools when teaching a specialized agent. Tool policy is one of the clearest
            ways to demonstrate different capabilities.
          </>,
        ],
      },
      {
        kind: 'example',
        title: 'Capable specialist agent',
        code: `# researcher

**System Prompt:** You are a research specialist. Gather evidence, compare sources, identify uncertainty, and produce actionable conclusions.

## Workflow
1. Clarify the research question when needed.
2. Prefer primary, official, recent, or directly relevant sources.
3. Cross-check important claims when possible.
4. Separate confirmed facts, interpretations, and open questions.

## Output Style
- Cite URLs, file paths, or source names when available.
- Use tables for comparisons when helpful.
- State confidence and caveats clearly.

**Tools:** search_web, read_file, search_files
**Model:** default
`,
      },
      {
        kind: 'example',
        title: 'Schema-backed extractor using a schema file',
        code: `# extractor

**System Prompt:** You extract structured data from unstructured text. Do not invent missing facts.

Return only valid JSON. Do not include prose or Markdown.

**Output Schema:** Entity Extractor
Extracts people, organizations, key facts, dates, and action items.
**Output Schema File:** schemas/output.json
**Tools:** none
**Model:** default
`,
      },
      {
        kind: 'intro',
        body: (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 space-y-2">
            <p className="font-700 text-amber-900 dark:text-amber-100">
              How structured-output agents work
            </p>
            <p>
              When an agent has an output schema, AgentPrimer can make a dedicated finalize call
              that converts the conversation into JSON matching that schema. If{' '}
              <C>**Tools:** none</C>, the agent behaves like a one-shot extractor. If tools are
              enabled, the agent can first gather context, then AgentPrimer finalizes the result
              into structured JSON.
            </p>
            <p>
              Prefer <C>**Output Schema File:** schemas/output.json</C> for larger schemas. It keeps{' '}
              <C>agent.md</C> readable and lets users inspect the schema separately in the agent
              folder.
            </p>
          </div>
        ),
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  'memory.md': {
    tagline: 'Private long-term memory for one agent',
    sections: [
      {
        kind: 'intro',
        body: (
          <p>
            <FileText size={14} className="inline -mt-1 mr-1 text-amber-500" />
            <strong>memory.md</strong> lives beside its agent at{' '}
            <C>data/agents/&lt;agent&gt;/memory.md</C>. It is private to that agent and is injected
            into that agent&apos;s system prompt on future turns.
          </p>
        ),
      },
      {
        kind: 'rules',
        title: 'Parser rules',
        items: [
          <>
            <strong>Free-form Markdown.</strong> No fields are parsed. The entire file is injected
            under <C>## Persistent Memory</C> when the agent runs.
          </>,
          <>
            The active agent can update its own memory with <C>append_memory</C> or, when explicitly
            requested, <C>replace_memory</C>.
          </>,
          <>
            Memory is per-agent. <C>coder/memory.md</C> does not automatically affect{' '}
            <C>researcher/memory.md</C>.
          </>,
          <>
            Empty memory is valid, but useful headings help the agent keep future updates organized.
          </>,
        ],
      },
      {
        kind: 'rules',
        title: 'What belongs in memory',
        items: [
          <>
            Durable user preferences, recurring workflows, stable project context, and reusable
            lessons learned.
          </>,
          <>
            Agent-specific operating notes, such as source preferences for a researcher or
            repository conventions for a coder.
          </>,
          <>Important decisions or constraints likely to matter in future conversations.</>,
          <>Do not store secrets, API keys, passwords, or one-off temporary details.</>,
        ],
      },
      {
        kind: 'rules',
        title: 'Writing tips',
        items: [
          <>
            Use stable headings such as <C>## User Preferences</C>, <C>## Important Context</C>,{' '}
            <C>## Repository Conventions</C>, or <C>## Learned Facts</C>.
          </>,
          <>
            Keep entries concise and reusable. Memory is sent to the model, so bloated memory makes
            every turn more expensive.
          </>,
          <>
            Prefer facts and lessons over transcripts. Summarize what matters, not everything that
            happened.
          </>,
          <>Periodically ask the agent to consolidate or prune stale memory.</>,
        ],
      },
      {
        kind: 'example',
        title: 'Suggested memory structure',
        code: `# Coder Memory

Private long-term memory for the coder agent.

## Coding Preferences
- Prefer TypeScript with strict types.
- Run lint and tests before reporting completion.

## Repository Conventions
- Use existing UI components before adding new ones.
- Keep API routes in app/api/ and shared logic in lib/.

## Learned Facts
- The project uses data/agents/<agent>/agent.md for agent definitions.
`,
      },
    ],
  },
};
