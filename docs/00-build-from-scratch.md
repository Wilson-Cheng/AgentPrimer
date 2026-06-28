# Module 00 — Build Your First Agent from Scratch

Next: [Architecture →](./01-architecture.md)

---

## Learning Objectives

After completing this module you will:
- Go from `create-next-app` to a working AI agent in under 100 lines of code
- Understand the minimal primitives: a system prompt, an API call, a tool loop
- See exactly what AgentPrimer adds on top of the raw building blocks

**Prerequisites:** Node.js 20+, an OpenAI-compatible API key (DeepSeek, OpenAI, Groq, etc.)

---

## Step 1 — Scaffold the Project

```bash
npx create-next-app@latest my-first-agent --typescript --tailwind --eslint --app --src-dir
cd my-first-agent
npm install openai ai zod uuid better-sqlite3
```

This installs:
- **openai** — the official OpenAI SDK (works with any compatible provider)
- **ai** — Vercel AI SDK (for the `useChat` React hook on the frontend)
- **zod** — schema validation
- **better-sqlite3** — zero-config persistence

---

## Step 2 — The Core Agent Function

Create `src/lib/agent.ts`:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
  apiKey:  process.env.OPENAI_API_KEY || '',
});

export async function runAgent(userMessage: string): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: 'You are a helpful assistant with access to tools.' },
    { role: 'user',   content: userMessage },
  ];

  for (let step = 0; step < 10; step++) {
    const response = await openai.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages,
      tools: [{
        type: 'function',
        function: {
          name: 'get_time',
          description: 'Get the current date and time',
          parameters: { type: 'object', properties: {} },
        },
      }],
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    if (!choice) break;

    // If the model produced a text answer, return it
    if (choice.finish_reason !== 'tool_calls' || !choice.message.tool_calls) {
      return choice.message.content ?? '';
    }

    // Execute each tool call and append results
    messages.push(choice.message);
    for (const tc of choice.message.tool_calls) {
      let result: unknown;
      if (tc.function.name === 'get_time') {
        result = new Date().toISOString();
      } else {
        result = { error: `Unknown tool: ${tc.function.name}` };
      }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return 'Max steps reached without a final answer.';
}
```

That's it. This is a complete ReAct agent loop in ~40 lines.

---

## Step 3 — An API Route

Create `src/app/api/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { runAgent } from '@/lib/agent';

export async function POST(request: NextRequest) {
  const { message } = await request.json();
  const response = await runAgent(message);
  return NextResponse.json({ response });
}
```

---

## Step 4 — A Minimal Chat UI

Replace `src/app/page.tsx`:

```tsx
'use client';
import { useState } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{role: string; content: string}>>([]);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setLoading(true);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input }),
    });
    const data = await res.json();
    setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    setInput('');
    setLoading(false);
  };

  return (
    <main className="max-w-2xl mx-auto p-4">
      <div className="space-y-4 mb-4">
        {messages.map((m, i) => (
          <div key={i} className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-blue-100 ml-12' : 'bg-gray-100 mr-12'}`}>
            <strong>{m.role === 'user' ? 'You' : 'Agent'}:</strong>
            <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          className="flex-1 border rounded-lg px-3 py-2" placeholder="Ask something…" />
        <button onClick={send} disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50">
          {loading ? '…' : 'Send'}
        </button>
      </div>
    </main>
  );
}
```

---

## Step 5 — Run It

```bash
export OPENAI_API_KEY=sk-your-key-here
npm run dev
```

Open http://localhost:3000 and ask "What time is it?" The agent will call `get_time` and return the current time. In ~60 lines of code you have a working ReAct agent.

---

## What You Just Built vs. AgentPrimer

| Your code | AgentPrimer adds |
|-----------|-----------------|
| One hard-coded tool | 21 built-in tools, N function tools, N skills, N MCP servers |
| Synchronous (user waits) | Streaming SSE to browser with real-time token display |
| One agent config | Multiple named agents with per-agent prompts/tools |
| In-memory conversation | SQLite persistence, session management, history |
| No memory | `data/agents/<agent>/memory.md` injected into every system prompt |
| No approval gates | Human-in-the-loop for dangerous operations |
| No sub-agents | Async background agents with task files |
| No streaming | Token-by-token streaming to the `useChat` hook |
| No typing indicator | Reasoning content panel, live tool call cards |
| No multimodal | Image, audio, and text file attachments |
| No RAG index | RAG with vector embeddings + FTS5 fallback |
| No system prompt viewer | See the exact composed prompt in the UI |
| No tool playground | Test any tool from the UI without writing code |
| No per-step trace | See every LLM call, timing, and tool I/O |

Your 60-line prototype and AgentPrimer run on the *exact same primitives*: a system prompt, an API call, and a loop that checks `finish_reason`. Everything else — streaming, persistence, tools, memory, approvals — is added in layers on top of those three things.

AgentPrimer is what your prototype grows into when you add every feature a production agent platform needs. The code in `lib/agent.ts` is still recognizably the same loop you just wrote.

---



## Next Steps

Now that you've built a minimal agent, continue with [Module 01: Architecture](./01-architecture.md) to see how AgentPrimer scales this foundation.
