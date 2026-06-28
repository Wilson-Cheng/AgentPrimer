# Security Policy

## Supported Versions

AgentPrimer is pre-1.0 software. Security fixes are applied to the `main` branch and included in the next tagged release. If you run a fork or pinned commit, update to the latest `main` or latest release after a security advisory is published.

## Reporting a Vulnerability

If you discover a security vulnerability in AgentPrimer, **please do not open a public GitHub issue**. Instead, report it privately via email to:

**728564+wilson-cheng@users.noreply.github.com**

Please include:

- A description of the issue and its potential impact
- Steps to reproduce (if possible, a minimal proof-of-concept)
- The affected version (commit hash or release tag)
- Any suggested remediation

We aim to acknowledge reports within 72 hours and provide a timeline for a fix within 7 days.

## Scope

AgentPrimer is a self-hosted platform that can give an LLM access to your filesystem, configured tools, and network. By design, it has a broad attack surface. We're particularly interested in reports about:

- **Authentication bypass** — JWT verification flaws, session fixation, registration race conditions
- **Path traversal** — file APIs that escape `data/` or another documented sandbox
- **Code injection** — installers, function tools, MCP servers, previews, or markdown rendering that execute attacker-controlled code unexpectedly
- **SQL injection** — better-sqlite3 prepared statements should make this unlikely, but please report any unparameterized query you find
- **API key leakage** — settings API responses, trace payloads, error messages, child-process environments, or logs that include configured secrets
- **Approval-gate bypass** — ways to make `delete_path` or `run_shell` execute without an interactive approval when approval is required
- **Stored XSS / same-origin preview escape** — generated content that can call authenticated AgentPrimer APIs or read sensitive same-origin data

## Out of scope

The following are known and **expected** behaviours of the system, not vulnerabilities:

- **Function tools and MCP servers are trusted executable code**. They run as child processes with filesystem and network access appropriate to the deployment. Only install packages you trust.
- **SKILL.md skills are trusted prompt instructions**. They are Markdown instruction modules loaded into the agent context; they are not executed directly, but they can influence model behavior.
- **The `run_shell` built-in tool, when enabled by the operator and approved in an interactive chat session, grants arbitrary shell access**. It ships disabled and cannot run from Tool Playground or async sub-agents.
- **Self-XSS via your own prompt** — if you paste raw HTML/JS into the chat input and the model echoes it back, that is rendered through `MarkdownContent` with React's escaping. Render-side issues are in scope; prompt-only jailbreaks are not.

## Deployment security notes

- Set `AGENT_PRIMER_SECRET` to a long random value in production.
- Treat `data/` as sensitive: it contains the SQLite database, uploaded files, memories, installed tools, and local configuration.
- The app container runs as root by design so the agent can install OS/npm/pip packages at runtime. This makes it effectively a single-tenant trusted environment — do not expose it on a public network, and place it behind your own authentication/network controls.
- The optional `code-server` compose service is behind the `devtools` profile and requires `CODE_SERVER_PASSWORD`. Do not expose it publicly without HTTPS and additional access controls.
- Rotate any API key that was ever stored in a committed file, shared terminal log, screenshot, or support bundle.

## Disclosure policy

Once a fix is available, we'll coordinate a public disclosure with the reporter. Credit will be given in the release notes unless you prefer to remain anonymous.
