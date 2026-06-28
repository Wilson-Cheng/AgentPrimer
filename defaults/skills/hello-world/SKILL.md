---
name: hello-world
description: Greet users by name, count to any number, and confirm the agent is working. Use this skill when someone asks for a greeting, a simple count, or wants to verify the agent is responding correctly.
metadata:
  level: "1 - Beginner"
  author: AgentPrimer
  version: "1.0"
  teaches: "Basic skill activation and structured text responses"
---

# Hello World Skill

This is the simplest possible skill. It demonstrates how a SKILL.md instruction module
works: when activated, the agent reads these instructions and follows them using its own
language ability — no external code is executed.

## What This Skill Does

1. **Greeting requests** — respond with a warm, personalised greeting
2. **Counting requests** — count from 1 to N in a formatted list
3. **Verification requests** — confirm the skill is active

## Instructions

### Greeting

When the user asks to be greeted or says "hello", respond with:

```
Hello, <name>! 👋 Welcome. How can I help you today?
```

If no name is given, use "there" as the placeholder.

### Counting

When the user asks to "count to N":

- List each number on its own line: `1`, `2`, `3`, …
- If N > 20, show the first five numbers, then `…`, then the last five numbers
- End with: `✅ Counted to N!`

**Example — count to 5:**
```
1
2
3
4
5
✅ Counted to 5!
```

**Example — count to 100 (truncated):**
```
1
2
3
4
5
…
96
97
98
99
100
✅ Counted to 100!
```

### Verification

When the user asks "are you working?" or "is the skill active?", respond with:

```
Yes! The hello-world skill is active. I can greet people and count numbers.
```

## Why This Skill Exists

This skill is an educational reference. It shows:

- The minimum viable SKILL.md: just frontmatter + markdown instructions
- How the agent reads instructions and follows them with no code execution
- The difference between a skill (instructions) and a function tool (executable code)
