---
name: skill-creator
description: Create new skills in the SKILL.md format following the agentskills.io specification. Use this skill when the user asks to create, write, or design a new agent skill.
metadata:
  level: "4 - Expert"
  author: AgentPrimer
  version: "1.0"
  teaches: "Meta-skill pattern, spec-compliant authoring, progressive disclosure design"
compatibility: Designed for any agent that can write files (write_file tool required to save output)
---

# Skill Creator

This is a **meta-skill** — a skill that creates other skills. It demonstrates the most
advanced pattern in the AgentPrimer curriculum: an agent that reasons about its own
capability layer and extends it.

## The agentskills.io Standard

Agent Skills (https://agentskills.io) is an open standard for packaging agent knowledge.
A skill is a directory containing at minimum a `SKILL.md` file:

```
my-skill/
├── SKILL.md          # Required: frontmatter metadata + instructions
├── scripts/          # Optional: executable code the agent can run
├── references/       # Optional: detailed reference documentation
└── assets/           # Optional: templates, data files, schemas
```

### SKILL.md Frontmatter Rules

```yaml
---
name: skill-name          # Required. Lowercase, hyphens only, max 64 chars.
                          # Must match the parent directory name exactly.
description: ...          # Required. Max 1024 chars. Describe WHAT it does
                          # AND WHEN to use it (helps agents discover it).
license: MIT              # Optional. License name or path to LICENSE file.
compatibility: ...        # Optional. Environment requirements if any.
metadata:                 # Optional. Arbitrary key-value pairs.
  author: your-name
  version: "1.0"
---
```

**Naming rules** (the name field AND directory name):
- Lowercase letters, digits, and hyphens only: `a-z`, `0-9`, `-`
- No consecutive hyphens (`--`)
- Must not start or end with a hyphen
- Must match the parent directory name exactly

**Description rules**:
- Must be specific enough for an agent to recognise a matching task
- Should include key trigger phrases (e.g. "Use when user mentions PDF, forms, or document extraction")
- Poor: `"Helps with PDFs."` — Good: `"Extract text and tables from PDFs, fill PDF forms, merge files. Use when handling PDF documents."`

## Creation Workflow

### Step 1 — Gather requirements

Ask the user (or infer from context):
1. What task should this skill handle?
2. What level is it? (Beginner / Intermediate / Advanced / Expert)
3. Are there specific inputs, outputs, or edge cases to handle?
4. Does it need scripts, references, or assets?

### Step 2 — Draft the skill name

Apply the naming rules:
- Convert spaces to hyphens
- Lowercase everything
- Remove special characters
- Verify uniqueness (does this name already exist?)

### Step 3 — Write the frontmatter

Fill in required fields (`name`, `description`) and any relevant optional fields.
Always include `metadata.level` and `metadata.teaches` for educational skills.

### Step 4 — Write the body

Structure the SKILL.md body for **progressive disclosure**:
1. **Opening paragraph** — one sentence: what this skill does and why it exists
2. **What This Skill Does** — bullet list of capabilities
3. **Instructions** — step-by-step workflow, numbered, with subheadings
4. **Examples** — 1-3 concrete input/output examples
5. **Edge Cases** — what to do when inputs are unusual or ambiguous

Keep the body under **500 lines** (per spec). Move detailed reference material to
`references/REFERENCE.md` if needed.

### Step 5 — Determine if scripts are needed

A skill needs a `scripts/` directory if:
- The task requires computation that the LLM cannot reliably do in its head
  (e.g. exact math, file parsing, API calls)
- The task benefits from deterministic code execution over probabilistic text generation

If scripts are needed, outline the script interface:
```
Script: scripts/process.py
Input:  <stdin or args>
Output: <stdout JSON or text>
```

### Step 6 — Output the skill

Produce the complete directory structure as file paths with their content:

```
<skill-name>/SKILL.md        ← always first
<skill-name>/scripts/...     ← only if needed
<skill-name>/references/...  ← only if needed
```

If the user has the `write_file` tool available, offer to write the files directly.
Otherwise, present the content in labelled code blocks.

### Step 7 — Validate

Run through this checklist before delivering:
- [ ] `name` field matches directory name exactly
- [ ] `name` contains only `a-z`, `0-9`, `-`; no consecutive hyphens
- [ ] `description` is ≤ 1024 characters and includes when-to-use language
- [ ] Body is under 500 lines
- [ ] At least one concrete example is included
- [ ] Instructions are numbered and actionable (not vague)

### Step 8 — Hand off to the user

After the skill is written and registered, your reply MUST end with the
following two-part hand-off so the user knows exactly what to do next:

1. **How to use it** — one or two sentences describing the trigger phrasing
   the agent will recognise (drawn from the skill's `description` field), so
   the user knows what to type to activate the skill.

2. **Enable it first** — a clear reminder that newly-created skills are
   registered in a **disabled** state and must be turned on before they
   become discoverable. Use wording like:

   > ⚠️ Newly-created skills are disabled by default. Open the
   > **[Skills & MCP](/skills)** page and toggle on **`<skill-name>`**
   > before your next message — otherwise the agent won't see it.

   Always include the literal `/skills` link and the exact skill name so
   the user can click straight through. Do NOT skip this reminder, even
   when the user seems experienced — disabled-by-default is the single
   most common reason a freshly-created skill appears not to work.

## Example Output

For a user request: *"Create a skill that summarises meeting notes"*

```yaml
---
name: meeting-summariser
description: Summarise meeting notes into action items, decisions, and key discussion points. Use when the user provides raw meeting notes, transcripts, or wants to process meeting minutes.
metadata:
  author: AgentPrimer
  version: "1.0"
---

# Meeting Summariser

...instructions...
```

## Common Mistakes to Avoid

- Using uppercase in the skill name (`PDF-Extractor` → should be `pdf-extractor`)
- Writing a description that only says what the skill is, not when to use it
- Making instructions so vague that an agent cannot follow them reliably
- Forgetting to include examples — examples dramatically improve agent performance
- Creating a skill for something that should be a function tool (if it needs to call an
  external API or run code, it should be a function tool, not a skill)
