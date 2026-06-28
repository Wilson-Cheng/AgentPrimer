# Changelog

All notable changes to AgentPrimer will be documented in this file.

This project follows a lightweight release-notes process until the first stable release.

## [Unreleased]

## [0.1.0] - 2026-06-27

Initial public open-source release.

### Added

- Hand-written ReAct agent loop with streaming, tool dispatch, and structured output.
- Three capability types: SKILL.md skills, function tools (sandboxed subprocesses), and MCP servers (stdio + SSE).
- 21 built-in tools, multi-agent orchestration, and a human-in-the-loop approval gate.
- RAG pipeline with a Python embedding sidecar and FTS5 fallback for degraded mode.
- Full Next.js 16 web UI: chat, agents/memory editor, settings, skills catalog, approvals, statistics, knowledge, tool playground, and agent-files editor.
- JWT authentication (httpOnly cookies) with bcrypt password hashing.
- 15-module learning curriculum under `docs/` with answer keys.

### Security

- Path sandboxing for all agent file access (traversal + symlink containment).
- Sandboxed-iframe CSP isolation for agent-generated HTML/SVG previews.
- Fatal startup error when `AGENT_PRIMER_SECRET` is unset in production, plus a loud warning in any non-production deployment using the public dev fallback secret.
- Constant-time comparison for legacy MD5 password hashes (auto-upgraded to bcrypt on successful login).
- In-memory login rate limiting to slow credential-stuffing and brute-force attempts.

## Release process

For each tagged release:

1. Move user-facing changes from `[Unreleased]` into a versioned section.
2. Include migration notes for database, Docker, or configuration changes.
3. Credit security reporters after coordinated disclosure, unless anonymity is requested.
