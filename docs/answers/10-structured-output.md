# Module 10 — Answer Key: Structured Output

## Exercise 1: Trace the code path

The function call chain from user message to response for the `extractor` agent:

```
POST /api/chat (route.ts:28)
  └─ createStreamingAgent
       ├─ getAgentConfig('extractor') → reads agents/<agent>/agent.md
       ├─ parseAgentsConfig() → reads the inline Output Schema block
       │  (returns { schema, label, description })
       ├─ hasNoTools(config.tools) → `Tools: none` means no built-ins/function tools/MCP
       ├─ buildSystemPrompt(...) → builds the minimal loop context
       ├─ createDataStreamResponse:
       │   └─ execute:
       │        ├─ internal agent loop
       │        │    └─ for a no-tools schema agent, skips straight to finalize
       │        └─ runFinalizeCall(...)
       │             ├─ buildFinalizeSystemPrompt(schema)
       │             ├─ openai.chat.completions.create({ response_format: { type: 'json_object' } })
       │             ├─ if provider rejects response_format, retry without it
       │             ├─ strict JSON.parse(rawText)
       │             ├─ emit data(finalize_call) and data(structured_output)
       │             └─ onFinish (from route.ts) → saveMessage to DB
```

The important distinction: schema agents always finish with `runFinalizeCall`; tools are optional before that final JSON conversion.

---

## Exercise 2: Add a new schema

In `data/agents/<agent>/agent.md`, add an inline `**Output Schema:**` block:

````markdown
# summarizer
**System Prompt:** You are a content summarizer. Read the provided text and extract structured information.
**Output Schema:** Article Summary
Extract a structured summary from an article.
```json
{
  "type": "object",
  "properties": {
    "headline": { "type": "string", "description": "Compelling headline for the article" },
    "one_sentence_summary": { "type": "string", "description": "One sentence summary of the entire article" },
    "key_points": {
      "type": "array",
      "items": { "type": "string" },
      "description": "3-5 key points from the article"
    },
    "target_audience": { "type": "string", "description": "Who this article is written for" },
    "word_count_estimate": { "type": "number", "description": "Estimated word count of the article" }
  },
  "required": ["headline", "one_sentence_summary", "key_points", "target_audience"]
}
```
**Tools:** read_file
**Model:** default
````

Select the `summarizer` agent. Paste an article or ask it to read a file: *"Read lib/agent.ts and summarize it"*

**Expected output:** The StructuredOutputPanel renders with fields:
- **headline:** (string)
- **one_sentence_summary:** (string value)
- **key_points:** (bullet list)
- **target_audience:** (string)
- **word_count_estimate:** (number, in monospace)

---

## Exercise 3: Explain the rendering paths

**Two code paths exist because of how `useChat` handles data:**

1. **Live path (during streaming):** `msg.data` contains the `structured_output` entry emitted via `formatDataStreamPart('data', [...])` after `runFinalizeCall`. The data is attached to the message by `useChat` as `message.data`.

2. **Historical path (after page reload):** `msg.data` is wiped by `useChat` when messages are restored from the DB. Instead, the parts `{ type: 'structured-output', data, schemaName, schemaLabel }` are restored from the `parts_json` column.

**Why `message.data` is lost on reload:** The `onFinish` callback in `route.ts` saves `parts_json` and `content` to the DB. But `useChat` does not persist `message.data` — it's a transient property. On reload, messages come from `getMessages()`, which returns DB rows. The `parts` list is restored from `parts_json`, and the `StructuredOutputPanel` reads from `parts` instead of `data`.

**In `MessageBubble.tsx`:**
- `soFromData` → reads from live `data` prop (line 112-115)
- `p.type === 'structured-output'` → reads from historical `parts` (line 158-181)

Both render the same `<StructuredOutputPanel>`, just from different sources.

---

## Exercise 4: Investigate the fallback

Install Ollama: `ollama run llama3.2`. Point AgentPrimer at `http://localhost:11434/v1` and set the model to `llama3.2`.

Send a message to the `extractor` agent.

**Expected if the local model supports `response_format`:**
- Works the same as with DeepSeek — JSON object returned

**Expected if the local model rejects `response_format`:**
- Line 1409-1415 catches the 400 error and retries without `response_format`
- The system prompt still instructs JSON-only output: "Output ONLY the raw JSON — no prose, no explanation"
- Most instruction-tuned local models still produce valid JSON
- The difference: without `response_format`, the model may add markdown code fences (```json ```) or explanatory text, requiring the cleaning code at line 1425 to strip them

**Test:** Compare responses with and without response_format to see if the local model follows the JSON-only instruction in the system prompt alone.

---

## Exercise 5: Add a priority badge

In `MessageBubble.tsx`, in the `StructuredFieldValue` function, add after the `sentiment` check (after line 943):

```typescript
const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

// Inside StructuredFieldValue, add after the sentiment check:
if (typeof value === 'string' && fieldKey === 'priority' && PRIORITY_STYLES[value]) {
  return (
    <span className={`inline-block text-sm font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[value]}`}>
      {value}
    </span>
  );
}
```

Now any structued output schema with a `priority` field that has values `critical`, `high`, `medium`, or `low` will render colored badges matching the severity.
