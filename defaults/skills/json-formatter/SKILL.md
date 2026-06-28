---
name: json-formatter
description: Format, validate, pretty-print, and query JSON data. Use this skill when the user provides raw or minified JSON and wants it cleaned up, validated, or wants to extract specific fields.
metadata:
  level: "2 - Intermediate"
  author: AgentPrimer
  version: "1.0"
  teaches: "Data transformation workflows and structured output"
---

# JSON Formatter Skill

This skill demonstrates a **data transformation workflow**: taking structured input,
processing it through a series of steps, and returning a well-formatted result. The
agent uses its reasoning to parse, validate, and transform JSON — no external tools
required.

## What This Skill Does

1. **Pretty-print** — format minified or badly-indented JSON with 2-space indentation
2. **Validate** — identify syntax errors and explain how to fix them
3. **Extract fields** — pull out specific keys or paths from a JSON object
4. **Summarise** — describe the structure and key fields of a JSON document

## Instructions

### Step 1 — Detect the task

Read the user's message and identify which operation is needed:

| User says | Operation |
|-----------|-----------|
| "format this JSON", "pretty print", "indent this" | → **pretty-print** |
| "is this valid JSON?", "check this JSON" | → **validate** |
| "get the value of X", "extract X from this JSON" | → **extract** |
| "what does this JSON contain?", "summarise this" | → **summarise** |

### Step 2 — Execute the operation

#### Pretty-print
Return the JSON with consistent 2-space indentation inside a code block:
```json
{
  "key": "value"
}
```

#### Validate
- If valid: confirm it is valid JSON, then pretty-print it
- If invalid: identify the exact error (e.g. "Missing closing bracket on line 3",
  "Trailing comma after last array element"), suggest the fix, and show the corrected version

#### Extract
Use dot notation (`user.address.city`) or array index (`items[0].name`) to navigate the
structure. Return only the requested value, formatted clearly. If the path does not exist,
say so and list the available top-level keys.

#### Summarise
Produce a bullet-point overview:
- Top-level type (object / array)
- Number of keys / items
- Key field names and their types
- Any nested objects or arrays worth noting

### Step 3 — Always end with a confirmation

After any operation, add a one-line summary:
> ✅ Formatted / ✅ Valid / ❌ Invalid — <reason> / ✅ Extracted `<path>`

## Edge Cases

- **Nested JSON strings**: if a field value looks like JSON itself, note it but do not
  auto-parse it unless the user asks
- **Large JSON**: if the document exceeds ~50 lines, show the first 30 lines and indicate
  how many lines were truncated
- **Comments**: standard JSON does not allow comments (`// …` or `/* … */`). Flag them
  as invalid and offer to strip them

## Example

**Input:**
```
{"name":"Alice","age":30,"address":{"city":"London","zip":"EC1A"}}
```

**Output:**
```json
{
  "name": "Alice",
  "age": 30,
  "address": {
    "city": "London",
    "zip": "EC1A"
  }
}
```
✅ Valid JSON — 3 top-level keys: `name` (string), `age` (number), `address` (object).
