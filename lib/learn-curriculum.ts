export interface LessonQuestion {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface LessonExperiment {
  title: string;
  instructions: string;
  href: string;
  cta: string;
}

export interface Lesson {
  slug: string;
  title: string;
  module: string;
  level: 'Beginner' | 'Intermediate';
  estimatedMinutes: number;
  summary: string;
  objectives: string[];
  content: string;
  experiments: LessonExperiment[];
  questions: LessonQuestion[];
}

export const LESSONS: Lesson[] = [
  {
    slug: '00-build-from-scratch',
    title: '00 — Build an Agent from Scratch',
    module: '00 Introduction',
    level: 'Beginner',
    estimatedMinutes: 10,
    summary: 'Start with the smallest useful mental model: an LLM, a tool, and a loop that feeds observations back into context.',
    objectives: [
      'Explain the minimum parts of an agent',
      'Understand why a loop is different from one chat completion',
      'Connect the toy agent to AgentPrimer architecture',
    ],
    content: `# Build an Agent from Scratch

![Colorful diagram for 00 build from scratch](/learn/00-build-from-scratch.svg)

Before reading the full codebase, learn the small version. An agent is not magic. It is a program that asks a model what to do, runs an action when the model requests one, then shows the result back to the model.

## The smallest useful agent

![Small agent loop illustration](/learn/00-small-agent-loop.svg)

## What the toy version teaches

A minimal agent has three jobs:

1. **Keep messages** so the model has context.
2. **Expose tools** so the model can request actions.
3. **Repeat** until the model stops asking for tools.

AgentPrimer uses the same idea, but with authentication, streaming, memory, approvals, RAG, traces, and a database.

## Why this lesson matters

When a production agent feels complex, reduce it back to this shape: **model decision → action → observation → next decision**. Every later lesson is a safer, more observable, more extensible version of that loop.`,
    experiments: [
      {
        title: 'Run a simple chat',
        instructions: 'Open Chat and ask the agent what tools it can use. Notice that it describes capabilities, not just text generation.',
        href: '/chat',
        cta: 'Open Chat',
      },
      {
        title: 'Inspect tools directly',
        instructions: 'Open Tool Playground and pick one simple built-in tool. Compare the tool description with how the agent described its abilities.',
        href: '/tools',
        cta: 'Open Tools',
      },
    ],
    questions: [
      {
        id: '00-loop-purpose',
        prompt: 'What makes an agent different from a single chatbot response?',
        options: ['It can loop through tool use and observations', 'It always uses a larger model', 'It never stores messages', 'It only returns JSON'],
        answer: 0,
        explanation: 'The loop lets the model request actions, observe results, and continue until the task is complete.',
      },
      {
        id: '00-observation',
        prompt: 'Why does the tool result go back into the model context?',
        options: ['So the model can observe what happened', 'So the UI can ignore it', 'So the database is optional', 'So tools run twice'],
        answer: 0,
        explanation: 'The model needs the observation to decide the next step or final answer.',
      },
      {
        id: '00-production',
        prompt: 'What does AgentPrimer add on top of the small toy agent?',
        options: ['Streaming, memory, approvals, RAG, traces, and persistence', 'Only a different CSS theme', 'Only static documentation', 'A rule that tools cannot run'],
        answer: 0,
        explanation: 'The production app keeps the same loop but adds safety, visibility, persistence, and extensibility.',
      },
    ],
  },
  {
    slug: '01-architecture',
    title: '01 — System Architecture',
    module: '01 Architecture',
    level: 'Beginner',
    estimatedMinutes: 12,
    summary: 'See how browser, API route, agent runtime, tools, memory, RAG, and SQLite fit together.',
    objectives: [
      'Trace one chat request through the stack',
      'Identify each major layer and responsibility',
      'Know where to look when adding a feature',
    ],
    content: `# System Architecture

![Colorful diagram for 01 architecture](/learn/01-architecture.svg)

AgentPrimer is a full-stack teaching app. The important idea is separation of concerns: the browser renders, the API route coordinates, the agent runtime reasons and acts, and infrastructure stores state.

## Big picture

![AgentPrimer architecture map](/learn/01-architecture-map.svg)

## The main layers

| Layer | Responsibility |
|------|----------------|
| Presentation | React UI, chat input, messages, trace drawer, preview panel |
| API | Request validation, session handling, persistence, streaming response |
| Agent | ReAct loop, tool dispatch, approvals, structured output, tracing |
| Infrastructure | SQLite, JWT auth, installer, RAG embeddings, file storage |

## Key insight

The agent loop is handwritten in **lib/agent.ts**. That is intentional: learners can inspect every model call, every tool result, and every stream event instead of trusting a hidden framework.`,
    experiments: [
      {
        title: 'Follow one request',
        instructions: 'Open Chat, send a message, then inspect the browser Network tab for /api/chat. Watch the streamed response arrive.',
        href: '/chat',
        cta: 'Open Chat',
      },
      {
        title: 'Browse app areas',
        instructions: 'Open RAG, Tools, Skills, and Settings. Match each page to the architecture layer it controls.',
        href: '/settings',
        cta: 'Open Settings',
      },
    ],
    questions: [
      {
        id: '01-agent-file',
        prompt: 'Which file contains the core handwritten agent loop?',
        options: ['lib/agent.ts', 'package.json', 'public/icon.svg', 'components/ui/Button.tsx'],
        answer: 0,
        explanation: 'lib/agent.ts is the core runtime for model calls, tool dispatch, streaming, approvals, and structured output.',
      },
      {
        id: '01-db',
        prompt: 'What does SQLite store in AgentPrimer?',
        options: ['Persistent app state such as sessions, messages, settings, RAG metadata, and tasks', 'Only CSS files', 'Only compiled JavaScript', 'Only images'],
        answer: 0,
        explanation: 'SQLite is the persistence layer for most durable runtime state.',
      },
      {
        id: '01-proxy',
        prompt: 'What is the role of proxy.ts?',
        options: ['JWT authentication middleware', 'A React component', 'A RAG chunker', 'A model provider'],
        answer: 0,
        explanation: 'In this Next.js version, proxy.ts is the middleware-style auth gate.',
      },
      {
        id: '01-separation',
        prompt: 'Why split the system into layers?',
        options: ['So each part has a clear responsibility', 'So every file is longer', 'So tools cannot be tested', 'So the browser owns secrets'],
        answer: 0,
        explanation: 'Clear layers make the app easier to inspect, test, and extend.',
      },
    ],
  },
  {
    slug: '02-agent-loop',
    title: '02 — The Agent Loop',
    module: '02 Agent Loop',
    level: 'Beginner',
    estimatedMinutes: 14,
    summary: 'Understand ReAct: reason, call a tool, observe the result, and continue safely until done.',
    objectives: [
      'Explain Reason → Act → Observe',
      'Understand streaming tool-call assembly',
      'Recognize why step limits matter',
    ],
    content: `# The Agent Loop

![Colorful diagram for 02 agent loop](/learn/02-agent-loop.svg)

ReAct means **Reason + Act**. The model reasons about the user goal, asks for a tool when needed, observes the tool output, then reasons again.

## Loop shape

![Colorful ReAct loop overview](/learn/react-loop-overview.svg)

## Step sequence

![AgentPrimer turn sequence](/learn/react-loop-sequence.svg)

## Why the loop needs guardrails

A loop can fail if the model repeats itself, calls the wrong tool, or never reaches a final answer. AgentPrimer uses step limits, tool validation, approval gates, and trace records to keep the loop understandable and bounded.

## What to inspect

A useful trace answers these questions:

- What did the model see?
- Which tools were available?
- Which tool did it call?
- What arguments did it produce?
- What did the tool return?
- Why did the loop stop?`,
    experiments: [
      {
        title: 'Trigger tool use',
        instructions: 'Ask the agent to inspect something in the project, then open the trace drawer and identify each model/tool step.',
        href: '/chat',
        cta: 'Open Chat',
      },
      {
        title: 'Review loop settings',
        instructions: 'Open Settings and find Max Agent Loop Steps. Think about why too low and too high are both risky.',
        href: '/settings',
        cta: 'Open Settings',
      },
    ],
    questions: [
      {
        id: '02-react',
        prompt: 'What does ReAct mean in agent design?',
        options: ['Reason plus Act', 'Render plus CSS', 'Retry all completions', 'Read every file automatically'],
        answer: 0,
        explanation: 'ReAct describes the repeated pattern of reasoning, acting with tools, and observing results.',
      },
      {
        id: '02-stop',
        prompt: 'When does a normal agent loop stop?',
        options: ['When the model produces a final answer or hits a configured limit', 'Only after exactly ten tools', 'Before seeing tool output', 'When the sidebar closes'],
        answer: 0,
        explanation: 'The loop stops on final model output or safety limits.',
      },
      {
        id: '02-observe',
        prompt: 'What is a tool result in ReAct vocabulary?',
        options: ['An observation', 'A CSS class', 'A database migration', 'A login token'],
        answer: 0,
        explanation: 'The result is the observation the model reads before deciding what to do next.',
      },
      {
        id: '02-trace',
        prompt: 'Why are traces useful?',
        options: ['They reveal each prompt, tool call, result, timing, and stop reason', 'They hide errors', 'They replace authentication', 'They prevent all hallucinations'],
        answer: 0,
        explanation: 'Traces make the invisible loop visible and debuggable.',
      },
    ],
  },
  {
    slug: '03-tools-and-skills',
    title: '03 — Tools, Skills, Function Tools, and MCP',
    module: '03 Capabilities',
    level: 'Beginner',
    estimatedMinutes: 15,
    summary: 'Learn the four ways AgentPrimer gives agents capabilities: built-ins, function tools, SKILL.md instructions, and MCP servers.',
    objectives: [
      'Separate callable tools from instruction skills',
      'Understand tool schemas and descriptions',
      'Know when MCP is useful',
    ],
    content: `# Tools, Skills, Function Tools, and MCP

![Colorful diagram for 03 tools and skills](/learn/03-tools-and-skills.svg)

Tools are the agent's hands. They turn model decisions into real actions. AgentPrimer intentionally shows several capability types so you can compare trade-offs.

## Capability map

![Agent capability map](/learn/03-capability-map.svg)

## The big distinction

- **Built-in tools** are trusted platform functions.
- **Function tools** are callable code packages with JSON schemas and subprocess isolation.
- **MCP tools** come from external MCP servers.
- **SKILL.md skills** are instructions, not function calls. The agent reads them and follows the workflow.

## Tool descriptions matter

A model chooses tools by reading names, descriptions, and parameter schemas. Clear schemas reduce bad arguments and unnecessary calls.`,
    experiments: [
      {
        title: 'Compare tool categories',
        instructions: 'Open Tool Playground. Inspect a built-in tool, a function tool, and any MCP or skill entries available in your app.',
        href: '/tools',
        cta: 'Open Tools',
      },
      {
        title: 'Browse installable capabilities',
        instructions: 'Open Skills & MCP and compare SKILL.md modules, function tools, and MCP server settings.',
        href: '/skills',
        cta: 'Open Skills',
      },
    ],
    questions: [
      {
        id: '03-skill',
        prompt: 'What is a SKILL.md skill?',
        options: ['A markdown instruction module the agent can load', 'A SQLite table', 'A JWT cookie', 'A mandatory shell command'],
        answer: 0,
        explanation: 'SKILL.md skills are procedural instructions, not executable functions.',
      },
      {
        id: '03-function-tool',
        prompt: 'Why do function tools run in subprocesses?',
        options: ['To isolate tool code from the main server', 'To make the UI blue', 'To disable JSON schemas', 'To skip validation'],
        answer: 0,
        explanation: 'Subprocess isolation keeps crashes or risky code away from the Next.js process.',
      },
      {
        id: '03-mcp',
        prompt: 'What does MCP standardize?',
        options: ['How agents connect to external tools and data servers', 'How CSS is compiled', 'How JWTs are signed', 'How SQLite stores rows'],
        answer: 0,
        explanation: 'MCP is a protocol for connecting agents to external capabilities.',
      },
      {
        id: '03-schema',
        prompt: 'What helps the model produce valid tool arguments?',
        options: ['Clear parameter schemas and descriptions', 'Hidden buttons', 'Random retries only', 'Deleting traces'],
        answer: 0,
        explanation: 'Descriptions and schemas teach the model what each tool expects.',
      },
    ],
  },
  {
    slug: '04-streaming',
    title: '04 — Streaming Protocol',
    module: '04 Streaming',
    level: 'Intermediate',
    estimatedMinutes: 12,
    summary: 'Understand how tokens, reasoning, tool calls, tool results, and final messages stream from server to browser.',
    objectives: [
      'Explain why streaming improves UX',
      'Recognize the main stream event types',
      'Connect backend stream parts to UI rendering',
    ],
    content: `# Streaming Protocol

![Colorful diagram for 04 streaming](/learn/04-streaming.svg)

Agent responses can take time. Streaming keeps users informed by sending tokens and events as soon as they happen.

## Stream flow

![Streaming event flow](/learn/04-stream-flow.svg)

## What gets streamed

AgentPrimer streams more than text:

- text tokens
- reasoning tokens when supported
- tool-call start and argument deltas
- complete tool calls
- tool results
- token usage
- trace payloads
- structured-output finalize data

## Why it matters

Streaming turns a long black-box wait into visible progress. It also lets learners watch tool calls happen before the final answer is ready.`,
    experiments: [
      {
        title: 'Watch a stream in DevTools',
        instructions: 'Open browser DevTools, filter Network for /api/chat, send a message, and inspect the response chunks.',
        href: '/chat',
        cta: 'Open Chat',
      },
      {
        title: 'Compare text and tool streams',
        instructions: 'Send one simple text question and one tool-heavy request. Notice how the streamed events differ.',
        href: '/chat',
        cta: 'Open Chat',
      },
    ],
    questions: [
      {
        id: '04-ux',
        prompt: 'What user problem does streaming solve?',
        options: ['It shows progress before the whole answer is complete', 'It removes the need for tools', 'It makes models deterministic', 'It replaces auth'],
        answer: 0,
        explanation: 'Users see activity immediately instead of waiting silently.',
      },
      {
        id: '04-events',
        prompt: 'Which event can be streamed besides text?',
        options: ['Tool calls and tool results', 'Only CSS variables', 'Only login forms', 'Only database migrations'],
        answer: 0,
        explanation: 'The stream includes tool-call lifecycle events and results.',
      },
      {
        id: '04-browser',
        prompt: 'Who consumes the stream in the frontend?',
        options: ['The chat UI through the AI SDK stream format', 'SQLite directly', 'The Python embed server', 'The Docker daemon'],
        answer: 0,
        explanation: 'The browser chat hook reads stream parts and updates message state.',
      },
    ],
  },
  {
    slug: '05-memory-and-agents',
    title: '05 — Memory and Agents',
    module: '05 Memory',
    level: 'Beginner',
    estimatedMinutes: 13,
    summary: 'Learn how system.md, agents/<agent>/memory.md, data/agents/<agent>/agent.md, pinned prompts, and async sub-agents shape behavior.',
    objectives: [
      'Separate memory files by purpose',
      'Configure named agents in data/agents/<agent>/agent.md',
      'Understand async sub-agent task tracking',
    ],
    content: `# Memory and Agents

![Colorful diagram for 05 memory and agents](/learn/05-memory-and-agents.svg)

Agents need instructions and context. AgentPrimer keeps these in human-readable files so learners can inspect and edit them.

## Memory layers

![Memory layer stack](/learn/05-memory-layers.svg)

## Important files

| File | Purpose |
|------|---------|
| system.md | Global instructions for every agent |
| agents/<agent>/memory.md | Durable facts and preferences |
| agents/<agent>/agent.md | Named agents, tool allowlists, model choices, output schemas |

## Agents as configuration

A named agent can specialize behavior without code changes. For example, one agent can have all tools, while another has no tools and only produces structured output.

## Async sub-agents

Long tasks can run in the background. AgentPrimer tracks them with task files, database rows, and notifications that the parent agent reads on later turns.`,
    experiments: [
      {
        title: 'Inspect memory files',
        instructions: 'Open Prompts & Memory and read system.md, agents/<agent>/memory.md, and data/agents/<agent>/agent.md. Identify which file you would edit for a user preference.',
        href: '/agents',
        cta: 'Open Prompts & Memory',
      },
      {
        title: 'Switch agents',
        instructions: 'Start a chat, switch the selected agent, and compare the system prompt preview before sending a message.',
        href: '/chat',
        cta: 'Open Chat',
      },
    ],
    questions: [
      {
        id: '05-memory-file',
        prompt: 'Which file stores durable facts injected into future conversations?',
        options: ['agents/<agent>/memory.md', 'package-lock.json', 'icon.svg', 'next-env.d.ts'],
        answer: 0,
        explanation: 'data/agents/<agent>/memory.md is the long-term memory file.',
      },
      {
        id: '05-agents',
        prompt: 'What does agents/<agent>/agent.md define?',
        options: ['Named agents, prompts, tools, models, and optional schemas', 'Only CSS colors', 'Only uploaded files', 'Only auth cookies'],
        answer: 0,
        explanation: 'agents/<agent>/agent.md is the human-editable agent configuration file.',
      },
      {
        id: '05-tools-none',
        prompt: 'What does Tools: none mean for an agent?',
        options: ['No callable tools are loaded', 'All tools are loaded', 'Only shell is loaded', 'The model is disabled'],
        answer: 0,
        explanation: 'Tools: none intentionally disables built-ins, function tools, and MCP tools.',
      },
      {
        id: '05-async',
        prompt: 'Why use an async sub-agent?',
        options: ['To run longer background work while the parent can continue', 'To delete session history', 'To avoid prompts entirely', 'To disable traces'],
        answer: 0,
        explanation: 'Async sub-agents are useful for long or parallel tasks.',
      },
    ],
  },
  {
    slug: '06-approval-gate',
    title: '06 — Approval Gate',
    module: '06 Safety',
    level: 'Beginner',
    estimatedMinutes: 10,
    summary: 'Learn how human approval pauses risky tool calls and resumes the agent safely.',
    objectives: [
      'Identify operations that need approval',
      'Understand once, session, and permanent scopes',
      'Explain why denial is sent as a user message',
    ],
    content: `# Approval Gate

![Colorful diagram for 06 approval gate](/learn/06-approval-gate.svg)

Powerful agents need guardrails. AgentPrimer asks the user before operations that can expose secrets or damage data.

## Approval flow

![Approval gate flow](/learn/06-approval-flow.svg)

## Approval scopes

| Scope | Meaning |
|------|---------|
| Once | Allow this one operation only |
| Session | Allow similar operations for this chat session |
| Permanent | Store approval until revoked |

## Why denial is a message

The agent reads approval or denial as natural conversation. That means it can explain, retry safely, or offer a different approach instead of crashing.`,
    experiments: [
      {
        title: 'Review approval settings',
        instructions: 'Open Approvals and inspect the permanent approvals area. Notice which operations are treated as sensitive.',
        href: '/approvals',
        cta: 'Open Approvals',
      },
      {
        title: 'Think through a denial',
        instructions: 'Ask what should happen if a delete operation is denied. Compare your expectation with the approval gate design.',
        href: '/chat',
        cta: 'Open Chat',
      },
    ],
    questions: [
      {
        id: '06-purpose',
        prompt: 'What is the approval gate for?',
        options: ['Pausing risky operations for human review', 'Styling chat bubbles', 'Replacing SQLite', 'Making all tools invisible'],
        answer: 0,
        explanation: 'The gate protects users from sensitive or destructive actions.',
      },
      {
        id: '06-scope',
        prompt: 'Which approval scope lasts beyond the current chat?',
        options: ['Permanent', 'Once', 'Session', 'Preview'],
        answer: 0,
        explanation: 'Permanent approvals are stored and can be revoked later.',
      },
      {
        id: '06-denial',
        prompt: 'Why send denial back as a user message?',
        options: ['So the agent can respond contextually', 'So the database is deleted', 'So the model ignores it', 'So auth is bypassed'],
        answer: 0,
        explanation: 'A natural-language denial lets the model adapt its next response.',
      },
    ],
  },
  {
    slug: '07-frontend',
    title: '07 — Frontend Architecture',
    module: '07 Frontend',
    level: 'Intermediate',
    estimatedMinutes: 13,
    summary: 'Understand how the React UI renders streaming messages, tools, traces, files, previews, and settings.',
    objectives: [
      'Map main frontend components',
      'Understand live versus historical rendering',
      'Explain the Preview Panel and file delivery path',
    ],
    content: `# Frontend Architecture

![Colorful diagram for 07 frontend](/learn/07-frontend.svg)

The frontend is not just decoration. It teaches what the agent is doing by showing messages, tool calls, reasoning, traces, files, token usage, and previews.

## Component map

![Frontend component map](/learn/07-frontend-map.svg)

## Live and historical paths

Live streams update the current message as events arrive. After reload, messages are rebuilt from SQLite fields such as content, tool calls, parts, reasoning, token usage, and trace JSON.

## Preview and files

Agents can create or send files. The UI keeps large bytes out of chat history by storing files separately and rendering metadata as previews and download links.`,
    experiments: [
      {
        title: 'Open the trace drawer',
        instructions: 'Send a tool-oriented prompt, then open the assistant message trace. Identify where the frontend exposes backend data.',
        href: '/chat',
        cta: 'Open Chat',
      },
      {
        title: 'Use the preview panel',
        instructions: 'Ask the agent to create a small HTML file and open it in preview. Watch how chat and preview work side by side.',
        href: '/chat',
        cta: 'Open Chat',
      },
    ],
    questions: [
      {
        id: '07-root',
        prompt: 'Which component owns the main chat UI state?',
        options: ['ChatInterface', 'lib/db.ts', 'proxy.ts', 'lib/embeddings.ts'],
        answer: 0,
        explanation: 'ChatInterface manages active session, messages, selectors, preview state, and send behavior.',
      },
      {
        id: '07-historical',
        prompt: 'Why does historical rendering need persisted fields?',
        options: ['Because live stream data disappears after reload', 'Because CSS is deleted', 'Because models cannot stream', 'Because auth is optional'],
        answer: 0,
        explanation: 'After reload, the UI reconstructs messages from saved database fields.',
      },
      {
        id: '07-preview',
        prompt: 'What is the Preview Panel for?',
        options: ['Viewing generated files like HTML, images, PDFs, and Markdown', 'Signing JWTs', 'Running database migrations', 'Replacing the model selector'],
        answer: 0,
        explanation: 'The preview panel lets users inspect generated or delivered files without leaving chat.',
      },
    ],
  },
  {
    slug: '08-database',
    title: '08 — Database Design',
    module: '08 Database',
    level: 'Intermediate',
    estimatedMinutes: 14,
    summary: 'Learn how SQLite stores settings, sessions, messages, tools, approvals, RAG chunks, tasks, progress, and token usage.',
    objectives: [
      'Identify major SQLite tables',
      'Understand WAL and additive migrations',
      'Connect message fields to UI rendering',
    ],
    content: `# Database Design

![Colorful diagram for 08 database](/learn/08-database.svg)

AgentPrimer uses one SQLite database so learners can run the whole system without external services.

## Major table groups

![SQLite data model map](/learn/08-database-map.svg)

## What is stored

| Area | Examples |
|------|----------|
| Settings | API keys, endpoint, default model, UI preferences |
| Chat | sessions, messages, parts, tool calls, traces, token usage |
| Capabilities | installed skills, function tools, MCP servers |
| Safety | permanent approvals |
| RAG | sources, chunks, embeddings, FTS5 index |
| Learning | lesson progress and quiz scores |

## Migration style

Migrations are additive: create tables if missing, then add columns if needed. This keeps local development simple and avoids a separate migration service.`,
    experiments: [
      {
        title: 'Inspect statistics',
        instructions: 'Open Statistics and connect token charts to the token_usage_log table described in the lesson.',
        href: '/statistics',
        cta: 'Open Statistics',
      },
      {
        title: 'Create a session',
        instructions: 'Start a new chat, send a message, then reload. Notice that persisted messages restore the conversation.',
        href: '/chat',
        cta: 'Open Chat',
      },
    ],
    questions: [
      {
        id: '08-db-choice',
        prompt: 'Why is SQLite useful for this learning app?',
        options: ['It is local, simple, and needs no separate database server', 'It replaces React', 'It prevents all bugs', 'It stores only CSS'],
        answer: 0,
        explanation: 'SQLite keeps local setup simple while still showing real persistence patterns.',
      },
      {
        id: '08-wal',
        prompt: 'What does WAL help with?',
        options: ['SQLite concurrency and reliability', 'Image compression', 'Prompt writing style', 'Model selection'],
        answer: 0,
        explanation: 'Write-ahead logging improves SQLite behavior under concurrent reads and writes.',
      },
      {
        id: '08-messages',
        prompt: 'Why do messages store tool and parts JSON?',
        options: ['To reconstruct rich assistant messages after reload', 'To avoid rendering messages', 'To disable traces', 'To remove sessions'],
        answer: 0,
        explanation: 'Rich UI elements need persisted structured data, not just text.',
      },
      {
        id: '08-rag',
        prompt: 'Which tables support RAG ingestion?',
        options: ['knowledge_sources and knowledge_chunks', 'only users', 'only sessions', 'only settings'],
        answer: 0,
        explanation: 'RAG stores source metadata and chunk text/embeddings in dedicated tables.',
      },
    ],
  },
  {
    slug: '09-ecosystem-comparison',
    title: '09 — Ecosystem Comparison',
    module: '09 Ecosystem',
    level: 'Intermediate',
    estimatedMinutes: 10,
    summary: 'Compare AgentPrimer with other agent applications to understand product and architecture trade-offs.',
    objectives: [
      'Compare learning-first and productivity-first designs',
      'Recognize feature trade-offs across agent apps',
      'Use comparisons to plan roadmap ideas',
    ],
    content: `# Ecosystem Comparison

![Colorful diagram for 09 ecosystem comparison](/learn/09-ecosystem-comparison.svg)

Agent apps make different choices. Some optimize for productivity, some for extensibility, and AgentPrimer optimizes for learning by exposing internals.

## Comparison lens

![Agent ecosystem comparison quadrant](/learn/09-ecosystem-quadrant.svg)

## What to compare

- Is the agent loop visible?
- Are tools easy to inspect?
- Is there human approval?
- Are traces available?
- Can users add skills or MCP servers?
- Is RAG included?
- Is the frontend production-like?

## Why comparison matters

A good engineer borrows ideas. Comparing systems helps you decide what to build next and what trade-offs you are willing to accept.`,
    experiments: [
      {
        title: 'Make your own feature matrix',
        instructions: 'Open the docs module for ecosystem comparison, then list three features you would add to AgentPrimer next.',
        href: '/learn',
        cta: 'Stay in Learn',
      },
      {
        title: 'Inspect current capabilities',
        instructions: 'Open Skills & MCP and Tool Playground. Decide which features feel like platform infrastructure versus examples.',
        href: '/skills',
        cta: 'Open Skills',
      },
    ],
    questions: [
      {
        id: '09-purpose',
        prompt: 'What is AgentPrimer primarily optimized for?',
        options: ['Learning how agentic systems work', 'Hiding all implementation details', 'Only writing CSS', 'Only storing PDFs'],
        answer: 0,
        explanation: 'AgentPrimer is intentionally transparent and educational.',
      },
      {
        id: '09-matrix',
        prompt: 'What is a feature matrix useful for?',
        options: ['Comparing trade-offs across systems', 'Encrypting cookies', 'Running SQL automatically', 'Replacing tests'],
        answer: 0,
        explanation: 'A matrix helps compare capabilities and architectural choices.',
      },
      {
        id: '09-roadmap',
        prompt: 'Why study other agent apps?',
        options: ['To discover roadmap ideas and trade-offs', 'To avoid understanding your own app', 'To delete documentation', 'To stop using tools'],
        answer: 0,
        explanation: 'Other systems reveal useful design patterns and gaps.',
      },
    ],
  },
  {
    slug: '10-structured-output',
    title: '10 — Structured Output',
    module: '10 Structured Output',
    level: 'Intermediate',
    estimatedMinutes: 13,
    summary: 'Learn how schema agents turn a conversation or document into reliable JSON through a finalize call.',
    objectives: [
      'Separate tool-call JSON from final structured output',
      'Understand inline output schemas in data/agents/<agent>/agent.md',
      'Explain the finalize call and rendering path',
    ],
    content: `# Structured Output

![Colorful diagram for 10 structured output](/learn/10-structured-output.svg)

Tool-call JSON is for actions. Structured output JSON is the final deliverable. AgentPrimer uses schema agents to produce final JSON from text or from a completed tool-using conversation.

## Structured output path

![Structured output flow](/learn/10-structured-output-flow.svg)

## Key concepts

- The schema is stored inline in **agents/<agent>/agent.md**.
- A **Tools: none** schema agent skips tool loading and goes straight to finalize.
- A schema agent with tools gathers information first, then finalizes the transcript.
- The UI renders live structured output from stream data and historical output from persisted parts.

## Why this matters

Production systems often need machine-readable output: extraction, classification, routing, grading, and reports. Structured output gives the model a contract.`,
    experiments: [
      {
        title: 'Try the extractor agent',
        instructions: 'Select an extractor-style agent if available, paste a short meeting note, and inspect the structured panel output.',
        href: '/chat',
        cta: 'Open Chat',
      },
      {
        title: 'Read schema config',
        instructions: 'Open Prompts & Memory and find an Output Schema block in data/agents/<agent>/agent.md. Notice that the schema is plain JSON.',
        href: '/agents',
        cta: 'Open Prompts & Memory',
      },
    ],
    questions: [
      {
        id: '10-tool-vs-output',
        prompt: 'How is structured output different from tool-call JSON?',
        options: ['It is the final JSON deliverable, not a request to run a function', 'It always deletes files', 'It only appears in CSS', 'It disables schemas'],
        answer: 0,
        explanation: 'Tool-call JSON tells the runtime what action to run; structured output is the response data itself.',
      },
      {
        id: '10-schema-location',
        prompt: 'Where are structured output schemas configured?',
        options: ['Inline in data/agents/<agent>/agent.md', 'Only in package.json', 'Only in CSS', 'Only in proxy.ts'],
        answer: 0,
        explanation: 'AgentPrimer keeps schema configuration next to the agent definition.',
      },
      {
        id: '10-finalize',
        prompt: 'What does the finalize call do?',
        options: ['Converts the completed transcript or input into schema-shaped JSON', 'Starts the dev server', 'Hashes passwords', 'Deletes old sessions'],
        answer: 0,
        explanation: 'The finalize call is focused on producing JSON that matches the schema.',
      },
      {
        id: '10-render',
        prompt: 'Why does the UI store structured output in parts_json?',
        options: ['So it can render correctly after page reload', 'So it never appears live', 'So the database is empty', 'So the schema is ignored'],
        answer: 0,
        explanation: 'Persisted parts let historical messages restore rich structured panels.',
      },
    ],
  },
  {
    slug: '11-rag',
    title: '11 — RAG',
    module: '11 RAG',
    level: 'Intermediate',
    estimatedMinutes: 14,
    summary: 'Understand chunking, embeddings, vector retrieval, FTS5 fallback, and how agents decide when to search RAG.',
    objectives: [
      'Explain chunk → embed → store → retrieve',
      'Understand local and OpenAI embedding providers',
      'Use RAG without confusing it with memory',
    ],
    content: `# RAG

![Colorful diagram for 11 rag](/learn/11-rag.svg)

RAG means **Retrieval-Augmented Generation**. Instead of stuffing every document into the prompt, the app retrieves only relevant chunks when needed.

## RAG pipeline

![RAG pipeline illustration](/learn/11-rag-pipeline.svg)

## RAG versus memory

| Use memory for | Use RAG for |
|---------------|-------------|
| Short durable facts | Longer documents |
| User preferences | PDFs, notes, specs, policies |
| Always-relevant context | Context that should be retrieved only when relevant |

## Important design choice

AgentPrimer does not auto-retrieve on every turn. The agent decides when to call **search_knowledge_base**. That makes retrieval visible in traces and helps learners understand when RAG is useful.`,
    experiments: [
      {
        title: 'Index a document',
        instructions: 'Open RAG, paste a short document, index it, then search for a phrase or synonym.',
        href: '/knowledge',
        cta: 'Open RAG',
      },
      {
        title: 'Ask a document-grounded question',
        instructions: 'After indexing a document, ask the agent a question that requires that document. Check whether it calls search_knowledge_base.',
        href: '/chat',
        cta: 'Open Chat',
      },
    ],
    questions: [
      {
        id: '11-purpose',
        prompt: 'What does RAG retrieve?',
        options: ['Relevant chunks from indexed documents', 'Every database row always', 'Only CSS files', 'Only login cookies'],
        answer: 0,
        explanation: 'RAG retrieves the most relevant text chunks for a query.',
      },
      {
        id: '11-fallback',
        prompt: 'What fallback is used when embeddings are unavailable?',
        options: ['SQLite FTS5 keyword search', 'Deleting the document', 'Turning off chat', 'Changing the sidebar color'],
        answer: 0,
        explanation: 'FTS5 gives keyword search when semantic embeddings are unavailable.',
      },
      {
        id: '11-memory',
        prompt: 'When is RAG better than agents/<agent>/memory.md?',
        options: ['For large documents where only some passages are relevant', 'For one-line user preferences', 'For the app logo', 'For hiding all source data'],
        answer: 0,
        explanation: 'RAG scales better for larger reference material.',
      },
      {
        id: '11-tool',
        prompt: 'Which built-in tool searches RAG content?',
        options: ['search_knowledge_base', 'delete_path', 'open_preview', 'replace_memory'],
        answer: 0,
        explanation: 'The historical tool name remains search_knowledge_base even though the UI calls the feature RAG.',
      },
    ],
  },
  {
    slug: '12-deployment-production',
    title: '12 — Deployment and Production',
    module: '12 Production',
    level: 'Intermediate',
    estimatedMinutes: 15,
    summary: 'Learn what changes when an agent app leaves local development: persistence, backups, proxying, monitoring, and observability.',
    objectives: [
      'Identify production deployment concerns',
      'Understand why data persistence matters',
      'Explain Langfuse and operational monitoring',
    ],
    content: `# Deployment and Production

![Colorful diagram for 12 deployment production](/learn/12-deployment-production.svg)

A local demo can be restarted freely. A production agent app needs persistence, security, observability, backups, and predictable operations.

## Production shape

![Production deployment shape](/learn/12-production-shape.svg)

## Production checklist

- Persist **data/** as a volume.
- Back up SQLite and uploaded/generated files.
- Disable proxy buffering for streamed chat responses.
- Store secrets carefully.
- Monitor latency, errors, token usage, and trace quality.
- Decide what data can leave your environment.

## Langfuse

Langfuse is optional observability. It helps inspect model calls, inputs, outputs, latency, and costs across real usage.`,
    experiments: [
      {
        title: 'Review production settings',
        instructions: 'Open Settings and identify which values would be important in production: endpoint, API key, model, tracing, and embedding provider.',
        href: '/settings',
        cta: 'Open Settings',
      },
      {
        title: 'Check token statistics',
        instructions: 'Open Statistics and think about how token usage becomes a production cost and monitoring signal.',
        href: '/statistics',
        cta: 'Open Statistics',
      },
    ],
    questions: [
      {
        id: '12-volume',
        prompt: 'Why must data/ be persisted in production?',
        options: ['It contains sessions, settings, memory, uploads, RAG data, and database files', 'It only contains temporary CSS', 'It is not used', 'It stores browser cache only'],
        answer: 0,
        explanation: 'Without a persistent data volume, rebuilds can lose important app state.',
      },
      {
        id: '12-streaming-proxy',
        prompt: 'What can proxy buffering break?',
        options: ['Real-time streaming responses', 'Static TypeScript types', 'SQLite table names', 'Mermaid diagrams'],
        answer: 0,
        explanation: 'Buffered proxies can delay streamed chunks until the response is complete.',
      },
      {
        id: '12-observability',
        prompt: 'What is observability useful for?',
        options: ['Debugging latency, errors, cost, and model behavior', 'Removing all logs', 'Disabling auth', 'Replacing backups'],
        answer: 0,
        explanation: 'Production agents need visibility into behavior and failures.',
      },
      {
        id: '12-backups',
        prompt: 'What should be backed up?',
        options: ['SQLite database and durable data files', 'Only node_modules', 'Only the browser tab', 'Only CSS comments'],
        answer: 0,
        explanation: 'Backups protect conversations, settings, memory, uploads, RAG data, and generated files.',
      },
    ],
  },
  {
    slug: '13-testing-agents',
    title: '13 — Testing AI Agents',
    module: '13 Testing',
    level: 'Intermediate',
    estimatedMinutes: 15,
    summary: 'Learn how to test an agent system with deterministic units, mocked models, tool dispatch checks, integration flows, and evals.',
    objectives: [
      'Separate deterministic tests from model behavior tests',
      'Understand how to mock LLM responses',
      'Explain why evals complement unit tests',
    ],
    content: `# Testing AI Agents

![Colorful diagram for 13 testing agents](/learn/13-testing-agents.svg)

Agent systems include normal software and probabilistic model behavior. Test both, but do not test them the same way.

## Testing pyramid for agents

![Agent testing pyramid](/learn/13-testing-pyramid.svg)

## What should be deterministic

- Zod-to-JSON-schema conversion
- agent config parsing
- database helpers
- tool validation
- RAG chunking and fallback logic
- approval-store decisions

## What needs mocks or evals

Model behavior should usually be mocked in automated tests. For quality questions, use evals: fixed prompts, expected traits, scoring rules, and traces you can review.`,
    experiments: [
      {
        title: 'Run the test suite',
        instructions: 'If you are running locally, run npm test and scan which areas have tests: auth, agent loop, RAG, registry, installer, skills, memory, and DB.',
        href: '/tools',
        cta: 'Open Tools',
      },
      {
        title: 'Inspect traces as eval data',
        instructions: 'Run a realistic prompt, open its trace, and decide what a good automated evaluation would check.',
        href: '/chat',
        cta: 'Open Chat',
      },
    ],
    questions: [
      {
        id: '13-deterministic',
        prompt: 'Which part is best suited for deterministic unit tests?',
        options: ['Schema conversion and config parsing', 'Whether a model likes a prompt', 'A random temperature output', 'A human preference with no rubric'],
        answer: 0,
        explanation: 'Pure functions and parser logic should have deterministic tests.',
      },
      {
        id: '13-mock',
        prompt: 'Why mock LLM responses in loop tests?',
        options: ['To make the sequence repeatable', 'To make tests slower', 'To hide tool calls', 'To skip assertions'],
        answer: 0,
        explanation: 'Mocking the model lets tests assert exact tool-call and stop sequences.',
      },
      {
        id: '13-evals',
        prompt: 'What do evals add beyond unit tests?',
        options: ['Quality checks over realistic prompts and outputs', 'A replacement for all code tests', 'A way to remove traces', 'A database schema'],
        answer: 0,
        explanation: 'Evals measure behavior quality that is hard to capture with pure unit tests.',
      },
      {
        id: '13-tool-tests',
        prompt: 'What should a tool test verify?',
        options: ['Argument validation, execution result, and error path', 'Only button color', 'Only the route name', 'Only the model logo'],
        answer: 0,
        explanation: 'Tools are deterministic code and should be tested like normal software.',
      },
    ],
  },
];

export function getLesson(slug: string): Lesson | undefined {
  return LESSONS.find(lesson => lesson.slug === slug);
}

export function getNextLesson(slug: string): Lesson | undefined {
  const index = LESSONS.findIndex(lesson => lesson.slug === slug);
  return index >= 0 ? LESSONS[index + 1] : undefined;
}

export function getPreviousLesson(slug: string): Lesson | undefined {
  const index = LESSONS.findIndex(lesson => lesson.slug === slug);
  return index > 0 ? LESSONS[index - 1] : undefined;
}
