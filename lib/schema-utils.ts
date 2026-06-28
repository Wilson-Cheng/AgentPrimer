import { z } from 'zod';

// ---------------------------------------------------------------------------
// JSON Schema → Zod converter
// ---------------------------------------------------------------------------
// Skills and MCP servers define their tool parameters as raw JSON Schema
// objects (because they come from JSON manifests, not TypeScript code).
// However, the agent loop validates tool arguments at runtime using Zod.
// This bridge function converts a common subset of JSON Schema into Zod
// schemas so that dynamic tool definitions can be validated the same way
// as built-in tools.
//
// Supported JSON Schema subset:
//   - type: object with properties and required
//   - field types: string, number, integer, boolean, array
//   - field descriptions (mapped to Zod .describe())
//   - optional fields (anything not in the required array)
//
// More complex schemas (anyOf, oneOf, allOf, nested objects) are accepted
// as z.record(z.any()) — they pass through without structural validation.
// ---------------------------------------------------------------------------
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  if (!schema || schema.type !== 'object' || !schema.properties) {
    return z.record(z.any());
  }

  const props = schema.properties as Record<string, Record<string, unknown>>;
  const required = (schema.required as string[]) ?? [];
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(props)) {
    let fieldSchema: z.ZodTypeAny;

    switch (prop.type) {
      case 'string':  fieldSchema = z.string(); break;
      case 'number':  fieldSchema = z.number(); break;
      case 'integer': fieldSchema = z.number().int(); break;
      case 'boolean': fieldSchema = z.boolean(); break;
      case 'array':   fieldSchema = z.array(z.any()); break;
      default:        fieldSchema = z.any();
    }

    if (prop.description) fieldSchema = fieldSchema.describe(prop.description as string);
    if (!required.includes(key)) fieldSchema = fieldSchema.optional();

    shape[key] = fieldSchema;
  }

  return z.object(shape);
}
