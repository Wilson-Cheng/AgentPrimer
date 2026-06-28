# Roadmap

AgentPrimer is an educational, self-hosted AI agent platform. The roadmap is intentionally pragmatic and may change based on maintainer capacity and community feedback.

## Near term

- Continue hardening filesystem, preview, function-tool, MCP, and shell-execution boundaries.
- Expand test coverage for security-sensitive API routes and preview rendering.
- Keep training modules aligned with implemented behavior as the application evolves.

## Mid term

- Add a dedicated authenticated health endpoint for production monitoring.
- Improve first-run setup hardening with an optional setup token for public deployments.
- Add richer audit logs for approvals, tool execution, and installed extensions.

## Longer term

- Explore stronger OS/container isolation for untrusted function tools and MCP servers.
- Add semantic long-term memory for `memory.md` while preserving the current simple Markdown model.
- Support multi-user roles only if the authorization model can remain clear enough for a learning project.
