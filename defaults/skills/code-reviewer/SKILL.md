---
name: code-reviewer
description: Perform a structured code review covering correctness, security, performance, and readability. Use this skill when the user asks to review, audit, or critique a block of code in any language.
metadata:
  level: "3 - Advanced"
  author: AgentPrimer
  version: "1.0"
  teaches: "Multi-step analysis workflow with structured output and severity classification"
---

# Code Reviewer Skill

This skill demonstrates a **multi-step structured analysis workflow** — one of the most
common patterns in real-world agentic applications. The agent follows a fixed checklist,
classifies findings by severity, and produces a standardised review report.

## Review Checklist

Run through each category below in order. For every issue found, record:
- **Severity**: 🔴 Critical / 🟠 Major / 🟡 Minor / 🔵 Style
- **Location**: line number or function name
- **Finding**: what the problem is
- **Suggestion**: the concrete fix

---

### 1. Correctness

Check for bugs that would cause wrong output or runtime errors:
- Off-by-one errors in loops and index accesses
- Null / undefined / nil access without guards
- Wrong operator (assignment `=` instead of equality `==`/`===`)
- Incorrect logic in conditionals
- Unhandled error returns or exceptions
- Race conditions in async/concurrent code

### 2. Security (OWASP Top 10 focus)

Check for vulnerabilities:
- **Injection**: user input used in SQL, shell commands, or `eval()` without sanitisation
- **Broken auth**: hardcoded credentials, tokens in source, missing auth checks
- **Sensitive data**: passwords, keys, PII logged or stored in plain text
- **Path traversal**: file paths derived from user input without validation
- **Dependency risk**: obviously outdated or vulnerable imports (flag, do not audit deeply)

### 3. Performance

Check for common inefficiency patterns:
- N+1 query patterns (database calls inside loops)
- Repeated expensive operations that could be cached or hoisted
- Unnecessary copies of large data structures
- Blocking I/O in async code paths
- Inefficient algorithm choices (O(n²) where O(n log n) exists, etc.)

### 4. Readability & Maintainability

Check for clarity issues:
- Unclear variable or function names (single letters in non-trivial contexts)
- Functions longer than ~40 lines that should be split
- Magic numbers / strings without named constants
- Missing or misleading comments on non-obvious logic
- Inconsistent style (mixed tabs/spaces, inconsistent naming conventions)

---

## Output Format

Structure your review as follows:

### Summary
One paragraph: what the code does, language/framework detected, overall quality rating
(Excellent / Good / Needs Work / Poor).

### Findings

For each issue, use this format:

```
[SEVERITY] Category — Location
Finding: <what is wrong>
Suggestion: <concrete fix with code snippet if helpful>
```

Group findings by severity (Critical first).

### Positive Highlights

List 2-3 things the code does well. Every review should include positives.

### Recommended Next Steps

A prioritised checklist of the top 3 actions the developer should take.

---

## Severity Definitions

| Level | When to use |
|-------|-------------|
| 🔴 Critical | Will cause data loss, security breach, or system crash in production |
| 🟠 Major | Significant bug or security issue, should fix before shipping |
| 🟡 Minor | Correctness concern or meaningful inefficiency, fix when possible |
| 🔵 Style | Readability / convention only, no functional impact |

## Language-Specific Notes

- **JavaScript/TypeScript**: flag `==` vs `===`, `var` vs `let`/`const`, missing `await`
- **Python**: flag bare `except:`, mutable default arguments, f-string vs `%` formatting
- **SQL**: flag `SELECT *`, missing `WHERE` on `UPDATE`/`DELETE`, unparameterised queries
- **Go**: flag ignored errors (`_`), goroutine leaks, missing context propagation

If the language is not listed above, apply the general checklist and note the language.
