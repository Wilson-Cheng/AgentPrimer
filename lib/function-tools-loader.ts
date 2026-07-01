/**
 * lib/function-tools-loader.ts
 * ---------------------------------------------------------------------------
 * Loads function tools and converts them into OpenAI-compatible callable
 * tool definitions for the agent loop.
 *
 * ── What is OpenAI Function Calling? ─────────────────────────────────────
 * Function calling (a.k.a. "tool use") is the mechanism by which an LLM
 * can invoke code during a conversation:
 *
 *   1. DEFINE   Describe the function in function.json using JSON Schema.
 *               The model reads the `name`, `description`, and `parameters`
 *               to decide WHEN and HOW to call the function.
 *
 *   2. DETECT   If the model decides to call a function it returns:
 *               finish_reason = "tool_calls"
 *               with the function name and JSON-encoded arguments.
 *
 *   3. EXECUTE  This loader's `execute()` runs the function in a subprocess
 *               (see the subprocess section below) and captures the result.
 *
 *   4. FEED BACK  The result is appended as a { role: "tool" } message and
 *                 the model is called again to generate the final response.
 *
 * This is the "Act" half of the ReAct (Reason + Act) agent loop.
 * See lib/agent.ts for the full loop implementation.
 *
 * ── Directory structure per function tool ────────────────────────────────
 *
 *   my-tool/
 *   ├── function.json   ← Required: OpenAI function schema
 *   └── index.js        ← Required: implementation (CommonJS module)
 *
 * function.json format (matches the OpenAI tools API schema exactly):
 *   {
 *     "name": "calculator",
 *     "description": "Evaluate a math expression. Use when...",
 *     "parameters": {
 *       "type": "object",
 *       "properties": {
 *         "expression": { "type": "string", "description": "..." }
 *       },
 *       "required": ["expression"]
 *     }
 *   }
 *
 * index.js format:
 *   'use strict';
 *   module.exports = {
 *     async calculator({ expression }) {
 *       return { result: ... };
 *     }
 *   };
 *
 * ── Subprocess isolation ─────────────────────────────────────────────────
 * Each tool invocation spawns a fresh Node.js child process (spawn()).
 *
 * WHY subprocess isolation matters:
 *   - A crashing or infinite-looping tool cannot take down the Next.js server
 *   - Memory leaks are bounded to the child process lifetime (256 MB cap)
 *   - Tools have no access to the server's module cache or in-process memory
 *   - The 35s timeout provides a hard upper bound on hung operations
 *   - Using spawn() rather than fork() avoids Turbopack's static analysis
 *     which would attempt to bundle fork() arguments as Next.js modules
 *
 * Communication protocol (JSON over stdio):
 *   Parent → Worker stdin:  { toolPath: "/path/to/index.js", toolName: "...", args: {...} }
 *   Worker → Parent stdout: { result: <any> }  OR  { error: "message" }
 *
 * ── Three sources of callable tools in an agent request ──────────────────
 *
 *   Source              │ Loaded by               │ Executed by
 *   ────────────────────┼─────────────────────────┼──────────────────────────
 *   Built-in tools      │ lib/agent.ts             │ In-process (same server)
 *   Function tools      │ lib/function-tools-loader│ Subprocess (spawn)
 *   MCP tools           │ lib/mcp-client.ts        │ MCP server process
 *
 * All three are merged into a single ToolSet before the agent loop starts.
 */

import { spawn } from 'child_process';
import path from 'path';
import { tool } from 'ai';
import { listFunctionTools } from './db';
import { jsonSchemaToZod } from './schema-utils';

// The worker script provides subprocess isolation for function tool execution.
// It is a generic "require index.js and call the named function" worker.
const WORKER_SCRIPT: string = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  'lib',
  'function-tool-worker.js',
);

// Resource limits applied to every tool invocation subprocess
const TOOL_TIMEOUT_MS = 35_000; // hard kill after this many ms (SIGKILL)
const TOOL_MEMORY_MB = 256; // --max-old-space-size for the worker process

// ── Subprocess runner ─────────────────────────────────────────────────────

/**
 * Run a function tool implementation in an isolated Node.js subprocess.
 *
 * Flow:
 *   1. spawn() a new Node process with the worker script
 *   2. Send { toolPath, toolName, args } as JSON over stdin
 *   3. Collect all stdout into a buffer
 *   4. On stdout end, parse { result } or { error } from the buffer
 *   5. Kill the process after TOOL_TIMEOUT_MS if it hasn't exited
 *
 * @param toolIndexPath  Absolute path to the tool's index.js
 * @param toolName       The exported function name to call
 * @param args           The parsed arguments object from the model
 */
function childProcessEnv(): Record<string, string> {
  const allowed = [
    'PATH',
    'HOME',
    'USER',
    'USERNAME',
    'TMPDIR',
    'TEMP',
    'TMP',
    'SystemRoot',
    'COMSPEC',
  ];
  const env: Record<string, string> = {};
  for (const key of allowed) {
    const value = process.env[key];
    if (typeof value === 'string') env[key] = value;
  }
  env.PATH = process.env.PATH ?? '';
  return env;
}

function runInSubprocess(toolIndexPath: string, toolName: string, args: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Spawn a fresh Node process with memory limit
    const worker = spawn(
      process.execPath,
      [`--max-old-space-size=${TOOL_MEMORY_MB}`, WORKER_SCRIPT],
      { stdio: ['pipe', 'pipe', 'inherit'], env: childProcessEnv() as NodeJS.ProcessEnv },
    );

    // Hard timeout — if the tool hangs, kill it and surface an error
    const killTimer = setTimeout(() => {
      worker.kill('SIGKILL');
      reject(new Error(`Function tool timed out after ${TOOL_TIMEOUT_MS / 1000}s`));
    }, TOOL_TIMEOUT_MS);

    // Collect all stdout chunks into a single buffer
    let outputBuffer = '';
    worker.stdout!.setEncoding('utf8');
    worker.stdout!.on('data', (chunk: string) => {
      outputBuffer += chunk;
    });

    worker.stdout!.on('end', () => {
      clearTimeout(killTimer);
      try {
        const msg = JSON.parse(outputBuffer.trim()) as { result?: unknown; error?: string };
        if ('result' in msg) resolve(msg.result);
        else reject(new Error(msg.error ?? 'Function tool execution failed with no error message'));
      } catch {
        reject(new Error(`Worker produced unparseable output: ${outputBuffer.slice(0, 200)}`));
      }
    });

    worker.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });

    // Send the execution request to the worker via stdin and close the pipe
    // to signal EOF — the worker reads until stdin closes, then processes.
    const input = JSON.stringify({ toolPath: toolIndexPath, toolName, args });
    worker.stdin!.write(input);
    worker.stdin!.end();
  });
}

// ── Types ─────────────────────────────────────────────────────────────────

/** Parsed from function.json — a single callable function definition */
interface FunctionDef {
  name: string;
  description: string;
  parameters: object; // JSON Schema object
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Load all enabled function tools and return them as AI SDK tool definitions.
 *
 * The returned object is merged with MCP tools and built-in tools to form
 * the complete ToolSet passed to the agent loop. The model sees all of them
 * identically as OpenAI "function" objects in the `tools` array.
 *
 * ── How the model chooses a tool ─────────────────────────────────────────
 * The model reads the `description` field to decide WHEN to call a tool.
 * It reads `parameters` (JSON Schema) to know WHAT arguments to produce.
 * Clear, specific descriptions are the single most impactful factor in
 * tool-use reliability — more so than any prompt engineering trick.
 *
 * @param filterNames  'all' = load all enabled tools
 *                     string[] = only tools whose name or package name matches
 *                     (used for per-agent restrictions defined in agent.md)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadFunctionTools(filterNames: string[] | 'all' = 'all'): Record<string, any> {
  const functionTools = listFunctionTools().filter((ft) => ft.enabled === 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  for (const ft of functionTools) {
    // Parse the stored function.json content
    let manifest: { functions?: FunctionDef[] } & Partial<FunctionDef>;
    try {
      manifest = JSON.parse(ft.manifest_json);
    } catch {
      console.warn(`function-tools-loader: skipping "${ft.name}" — invalid function.json`);
      continue;
    }

    // function.json can declare a single function (top-level name/description/parameters)
    // or an array of functions under a "functions" key.
    const defs: FunctionDef[] =
      manifest.functions ?? (manifest.name ? [manifest as FunctionDef] : []);

    for (const def of defs) {
      // Apply the per-agent filter: match on individual function name or package name
      if (
        filterNames !== 'all' &&
        !filterNames.includes(def.name) &&
        !filterNames.includes(ft.name)
      ) {
        continue;
      }

      // Build the absolute path to this tool's index.js
      const toolIndexPath = path.join(ft.local_path, 'index.js');
      const capturedName = def.name;
      const capturedPath = toolIndexPath;

      // Register the tool using the Vercel AI SDK's `tool()` helper.
      // The AI SDK converts the Zod schema back to JSON Schema for the OpenAI API.
      // The `execute` function is called by the agent loop when the model emits
      // a tool_call with this function's name.
      tools[def.name] = tool({
        description: def.description,
        parameters: jsonSchemaToZod(def.parameters as Record<string, unknown>),
        execute: async (args: object) => {
          // ── Stage 3: Execute ───────────────────────────────────────────
          // The model has generated arguments; run the implementation
          // in an isolated subprocess and return the result.
          return runInSubprocess(capturedPath, capturedName, args);
        },
      });
    }
  }

  return tools;
}
