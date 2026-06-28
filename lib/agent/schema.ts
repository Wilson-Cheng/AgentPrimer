/**
 * lib/agent/schema.ts
 * ---------------------------------------------------------------------------
 * Helpers that convert Zod schemas to the JSON Schema format expected by
 * the OpenAI Chat Completions API.
 */
import type OpenAI from 'openai';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolSet } from './types';

/**
 * Convert a Zod schema to the JSON Schema format expected by the OpenAI API.
 *
 * `zod-to-json-schema` adds a `$schema` meta-key that OpenAI's validation rejects
 * with a 400 error, so we delete it. All other fields pass through unchanged.
 */
export function zodToOpenAISchema(schema: z.ZodType): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = zodToJsonSchema(schema) as Record<string, any>;
  delete json['$schema']; // OpenAI rejects $schema – remove before sending
  return json;
}

/**
 * Convert our internal ToolSet into the format required by the OpenAI API:
 *   [{ type: "function", function: { name, description, parameters } }, …]
 *
 * The model reads `description` to decide WHEN to call a tool.
 * The model reads `parameters` (JSON Schema) to know WHAT arguments to produce.
 * Writing clear, specific descriptions is the most impactful thing you can do
 * to improve tool-use reliability.
 */
export function toolsToOpenAIFormat(tools: ToolSet): OpenAI.Chat.ChatCompletionTool[] {
  return Object.entries(tools).map(([name, t]) => ({
    type: 'function' as const,
    function: {
      name,
      description: t.description ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: zodToOpenAISchema(t.parameters) as any,
    },
  }));
}
