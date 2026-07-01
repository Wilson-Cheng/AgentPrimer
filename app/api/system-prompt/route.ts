import { NextRequest, NextResponse } from 'next/server';
import {
  getAgentConfig,
  getAgentMemoryRelativePath,
  getAgentRelativePath,
  readMemory,
  readSystemPrompt,
  hasNoTools,
  MAIN_AGENT_NAME,
} from '@/lib/memory';
import { getPendingNotifications } from '@/lib/db';
import { buildSystemPrompt, createBuiltinTools, toolsToOpenAIFormat } from '@/lib/agent';
import { loadFunctionTools } from '@/lib/function-tools-loader';
import { loadMcpTools } from '@/lib/mcp-client';
import { getSetting } from '@/lib/db';
import { buildSkillDiscoverySection } from '@/lib/skills-loader';

type ToolSource = 'builtin' | 'function' | 'mcp';

export async function GET(request: NextRequest) {
  const agentName = request.nextUrl.searchParams.get('agent') || MAIN_AGENT_NAME;
  const sessionId = request.nextUrl.searchParams.get('sessionId') || undefined;
  // Heavy work (loadMcpTools spawns stdio subprocesses with 15s connect
  // timeouts; loadFunctionTools reads disk) only runs when the modal asks
  // for it — i.e. when the user clicks the Tools or API Payload tab.
  const includeTools = request.nextUrl.searchParams.get('includeTools') === '1';

  const config = getAgentConfig(agentName);
  const memory = readMemory(config.name);
  const systemBase = readSystemPrompt();

  const pendingNotifications = sessionId ? getPendingNotifications(sessionId) : [];

  // Schema-bound agents run the SAME loop prompt as any other agent —
  // the schema is enforced post-loop by `runFinalizeCall` (lib/agent.ts)
  // and lives in its own dedicated finalize-call system prompt, never in
  // the loop's prompt. So the preview here is identical for both cases.
  const composed_base = buildSystemPrompt(
    config.systemPrompt,
    memory,
    pendingNotifications.length ? pendingNotifications : undefined,
  );
  const isStructured = !!config.outputSchema;
  const schemaLabel = config.outputSchema?.label ?? '';

  // Append the Stage 1 skill-discovery section ("## Available Skills" +
  // load_skill instructions) the same way `createStreamingAgent` does.
  const { section: skillSection } = buildSkillDiscoverySection(config.tools);
  const composed = composed_base + skillSection;

  // ── Tools assembly (lazy) ──────────────────────────────────────────────
  // Mirrors `createStreamingAgent` in lib/agent.ts so the modal shows what
  // the model will actually receive. Structured-output agents now also
  // load tools — the schema only affects the FINAL answer, not the loop.
  let toolsJSON: ReturnType<typeof toolsToOpenAIFormat> = [];
  let toolSources: { name: string; source: ToolSource }[] = [];
  let toolsError: string | undefined;
  // Mirror the special-case in createStreamingAgent via the shared helper
  // so the modal preview always agrees with what the agent loop will send.
  const isNoTools = hasNoTools(config.tools);
  if (includeTools && !isNoTools) {
    try {
      const functionTools = loadFunctionTools(config.tools);
      const mcpTools = await loadMcpTools(config.tools);
      const builtins = createBuiltinTools(agentName, sessionId, undefined, sessionId, config.tools);

      // Track sources with the SAME last-writer-wins semantics as the spread
      // below, so the badge always names the source whose schema the model
      // actually receives on a name collision (mcp beats function, builtin
      // beats both).
      const sourceMap = new Map<string, ToolSource>();
      Object.keys(functionTools).forEach((n) => sourceMap.set(n, 'function'));
      Object.keys(mcpTools).forEach((n) => sourceMap.set(n, 'mcp'));
      Object.keys(builtins).forEach((n) => sourceMap.set(n, 'builtin'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged = { ...functionTools, ...mcpTools, ...builtins } as any;
      // `toolsToOpenAIFormat` always returns ChatCompletionFunctionTool
      // entries (it builds them with `type: 'function'`), but the SDK return
      // type widens to the union ChatCompletionFunctionTool | ChatCompletionCustomTool.
      // Narrow once here so the `.function.name` access below is type-safe.
      toolsJSON = toolsToOpenAIFormat(merged);
      toolSources = (toolsJSON as Array<{ function: { name: string } }>).map((t) => ({
        name: t.function.name,
        source: sourceMap.get(t.function.name) ?? 'builtin',
      }));
    } catch (err) {
      console.warn('[system-prompt] tools assembly failed:', err);
      toolsError = err instanceof Error ? err.message : String(err);
    }
  }

  // ── Example payload ────────────────────────────────────────────────────
  // The JSON body sent to POST /v1/chat/completions on the first turn.
  // The `tools` field is intentionally omitted here and stitched in by the
  // modal at render time so the same schemas aren't serialized twice.
  const modelId = config.model || getSetting('default_model') || '<model>';
  // Match the agent loop's behavior: when the composed system prompt is
  // completely empty (user wiped system.md, agent prompt, and memory), we
  // do NOT include a system message at all so the preview accurately
  // reflects a "raw" API call with only the user's message.
  const messages: Array<{ role: string; content: string }> = composed
    ? [
        { role: 'system', content: composed },
        { role: 'user', content: '<your message here>' },
      ]
    : [{ role: 'user', content: '<your message here>' }];
  const examplePayload: Record<string, unknown> = {
    model: modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (includeTools && toolsJSON.length > 0) {
    // Placeholder — the modal replaces this with `data.tools` on render so
    // the schemas live in exactly one place in the response body.
    examplePayload.tools = '<see Tools tab>';
    examplePayload.tool_choice = 'auto';
  }
  // NOTE: structured-output agents run the normal streaming ReAct loop —
  // they do NOT send `response_format` on this main request. After the
  // loop ends, `runFinalizeCall` (lib/agent.ts) fires ONE additional
  // non-streaming call with its own focused system prompt + the schema +
  // `response_format: json_object`. That second call is shown to the user
  // as a separate "Finalizing as JSON" bubble in the chat — see the
  // FinalizeCallBubble component for details. The first-turn payload
  // below therefore looks identical to a non-schema agent.

  return NextResponse.json({
    agentName,
    systemBase,
    agentSystemPrompt: config.systemPrompt,
    agentPath: getAgentRelativePath(config.name),
    memory,
    memoryPath: getAgentMemoryRelativePath(config.name),
    composed,
    isStructured,
    schemaLabel: schemaLabel || undefined,
    pendingNotifications: pendingNotifications.length,
    tools: toolsJSON,
    toolSources,
    toolsLoaded: includeTools,
    toolsError,
    examplePayload,
  });
}
