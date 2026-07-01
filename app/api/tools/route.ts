/**
 * app/api/tools/route.ts
 * ---------------------------------------------------------------------------
 * Tool Playground API — list all available tools and execute them on demand.
 *
 * GET  /api/tools  → returns { builtins, skills, functionTools, mcp }
 * POST /api/tools  → executes a single tool and returns { result }
 *
 * ── Three kinds of tools in this application ─────────────────────────────
 *
 *   Skills (SKILL.md)
 *     Instruction modules — NOT callable. Their SKILL.md content is injected
 *     into the agent system prompt. The playground shows the full SKILL.md
 *     body so developers can read exactly what the agent receives.
 *
 *   Function Tools (function.json + index.js)
 *     OpenAI function-calling format. Callable via tool_call. The playground
 *     renders a parameter form and executes the tool in a subprocess.
 *
 *   MCP Tools
 *     Model Context Protocol. Callable via tool_call. The playground proxies
 *     the call to the running MCP server process.
 *
 *   Built-in Tools
 *     In-process TypeScript functions (read_file, write_file, etc.).
 *     Callable via tool_call. The playground executes them in-process.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBuiltinToolParameterSchemas, createBuiltinTools, zodToOpenAISchema } from '@/lib/agent';
import { loadSkillContext } from '@/lib/skills-loader';
import { loadFunctionTools } from '@/lib/function-tools-loader';
import { loadMcpTools } from '@/lib/mcp-client';

interface ToolEntry {
  id: string;
  name: string;
  description: string;
  /** JSON Schema for callable tools; empty object {} for skills */
  parameters: Record<string, unknown>;
  category: string;
  source: string;
  /** For skills only: the full SKILL.md body to display in the playground */
  body?: string;
}

export async function GET() {
  // ── Built-in tools ────────────────────────────────────────────────────
  const builtinSchemas = getBuiltinToolParameterSchemas();
  const builtins: ToolEntry[] = Object.entries(builtinSchemas).map(([id, s]) => ({
    id,
    name: id,
    description: s.description ?? '',
    parameters: s.parameters,
    category: s.category,
    source: 'builtin',
  }));

  // ── Skills (SKILL.md — context injection, not callable) ───────────────
  // Skills are listed so developers can preview what gets injected into
  // the system prompt. The `body` field carries the full SKILL.md content.
  const skillContexts = loadSkillContext('all');
  const skills: ToolEntry[] = skillContexts.map((ctx) => ({
    id: ctx.name,
    name: ctx.name,
    description: ctx.description,
    parameters: {}, // skills have no parameters — they are not callable
    category: 'skill',
    source: ctx.name,
    body: ctx.raw, // full SKILL.md content for playground display
  }));

  // ── Function tools (OpenAI function-calling format, subprocess execution) ─
  const fnToolsMap = loadFunctionTools('all');
  const functionTools: ToolEntry[] = [];
  for (const [key, def] of Object.entries(fnToolsMap)) {
    functionTools.push({
      id: key,
      name: key,
      description: (def as { description?: string }).description ?? '',
      parameters: zodToOpenAISchema((def as { parameters: import('zod').ZodType }).parameters),
      category: 'function_tool',
      source: key,
    });
  }

  // ── MCP tools ────────────────────────────────────────────────────────
  const mcpTools: ToolEntry[] = [];
  try {
    const mcpToolsMap = await loadMcpTools('all');
    for (const [key, def] of Object.entries(mcpToolsMap)) {
      mcpTools.push({
        id: key,
        name: key,
        description: (def as { description?: string }).description ?? '',
        parameters: zodToOpenAISchema((def as { parameters: import('zod').ZodType }).parameters),
        category: 'mcp',
        source: key.split('__')[0] ?? key,
      });
    }
  } catch {
    // MCP connection failures should not block the rest of the tool listing
  }

  return NextResponse.json({ builtins, skills, functionTools, mcp: mcpTools });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const { toolId, toolType, args } = body as {
    toolId: string;
    toolType: 'builtin' | 'skill' | 'function_tool' | 'mcp';
    args: Record<string, unknown>;
  };

  if (!toolId || !toolType) {
    return NextResponse.json({ error: 'toolId and toolType are required' }, { status: 400 });
  }

  try {
    let result: unknown;

    if (toolType === 'builtin') {
      // Execute an in-process built-in tool
      const tools = createBuiltinTools('_playground', undefined);
      const toolDef = tools[toolId];
      if (!toolDef?.execute) {
        return NextResponse.json({ error: `Built-in tool not found: ${toolId}` }, { status: 404 });
      }
      result = await toolDef.execute(args);
    } else if (toolType === 'skill') {
      // Skills are not callable — return their SKILL.md body as the "result"
      // so the playground can display the full instructions.
      const contexts = loadSkillContext('all');
      const skill = contexts.find((c) => c.name === toolId);
      if (!skill) {
        return NextResponse.json({ error: `Skill not found: ${toolId}` }, { status: 404 });
      }
      result = {
        type: 'skill_preview',
        name: skill.name,
        description: skill.description,
        content: skill.raw,
        note: 'Skills are instruction modules. This is the full SKILL.md content that gets injected into the agent system prompt.',
      };
    } else if (toolType === 'function_tool') {
      // Execute a function tool in a subprocess
      const fnTools = loadFunctionTools('all') as Record<
        string,
        { execute?: (args: Record<string, unknown>) => Promise<unknown> }
      >;
      const toolDef = fnTools[toolId];
      if (!toolDef?.execute) {
        return NextResponse.json({ error: `Function tool not found: ${toolId}` }, { status: 404 });
      }
      result = await toolDef.execute(args);
    } else if (toolType === 'mcp') {
      // Execute an MCP tool via the MCP client
      const mcpToolsMap = (await loadMcpTools('all')) as Record<
        string,
        { execute?: (args: Record<string, unknown>) => Promise<unknown> }
      >;
      const toolDef = mcpToolsMap[toolId];
      if (!toolDef?.execute) {
        return NextResponse.json({ error: `MCP tool not found: ${toolId}` }, { status: 404 });
      }
      result = await toolDef.execute(args);
    } else {
      return NextResponse.json({ error: `Unknown tool type: ${toolType}` }, { status: 400 });
    }

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
