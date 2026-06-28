# Contributing to AgentPrimer

Thanks for your interest in improving AgentPrimer! This document covers how
to set up your environment, run the project locally, and submit changes.

## Getting started

### Prerequisites

- **Node.js 20+** and npm
- **Git** (for cloning function-tool and MCP-server packages at install time)

> **No Python required.** Local RAG embeddings run in-process via
> `@huggingface/transformers` (the `all-MiniLM-L6-v2` ONNX model). The model
> downloads to `data/models/` on first use; if it can't load, RAG falls back
> to FTS5 keyword search.

### Install and run

```bash
git clone https://github.com/wilson-cheng/AgentPrimer.git
cd AgentPrimer
npm install

npm run dev
```

The dev server runs on port 15432 and exposes the chat UI at
`http://localhost:15432`. Local embeddings load in-process on first RAG use —
no separate sidecar process. If the model can't load, the app continues
normally and only the RAG semantic search falls back to FTS5 keyword search.

First-run setup happens entirely in the browser:

1. Visit `/register` to create the admin account.
2. Visit `/setup` to configure your LLM endpoint and API key.
3. Open `/chat` and send a message.

## Project layout

The project structure and key design decisions are documented in
[CLAUDE.md](./CLAUDE.md) and the [docs/](./docs) module series. Module
[01-architecture.md](./docs/01-architecture.md) is the best starting point
for a tour of the codebase.

## Running the test suite

```bash
npm test          # vitest run (one-shot)
npm run lint      # ESLint
```

Tests live in [tests/](./tests). Every PR should add or update tests where
behaviour changes. If you add a new module under `lib/`, add a matching
`*.test.ts` file.

## Coding conventions

- **TypeScript** — Match the surrounding code's style. Prefer named exports
  over default exports for shared utilities; use a single default export for
  React page/component files.
- **Tools** — New built-in tools go in [lib/agent.ts](./lib/agent.ts) and
  must be registered in
  [lib/builtin-tools-registry.ts](./lib/builtin-tools-registry.ts) with a
  meaningful description (the description is what the model reads).
- **Schemas** — All tool parameters use **Zod**. The agent loop converts to
  JSON Schema automatically via `zodToOpenAISchema`.
- **Components** — UI components live in [components/](./components). Keep
  files under 500 lines; if a component grows past that, split it into a
  subfolder (see `components/message/` as the canonical example).
- **Comments** — Comment the *why*, not the *what*. The codebase intentionally
  has many design-decision comments — it's a teaching project.
- **No `eval()` or `new Function()` with user input** — function tools that
  process expressions must whitelist allowed characters (see
  [defaults/function-tools/calculator/index.js](./defaults/function-tools/calculator/index.js)).

## Adding a function tool

A function tool is a callable function the model can invoke with JSON
arguments. See
[docs/03-tools-and-skills.md](./docs/03-tools-and-skills.md#building-your-own-function-tool)
for the full walkthrough. The short version:

1. Create `data/function-tools/<name>/function.json` (OpenAI function schema)
2. Create `data/function-tools/<name>/index.js` (CommonJS module)
3. Open **Skills & MCP → Function Tools** → **Discover** → **Enable**

## Adding a SKILL.md skill

A skill is an instruction module the agent reads and follows — no code
execution. See
[docs/03-tools-and-skills.md](./docs/03-tools-and-skills.md#skills-skillmd--instruction-modules)
for the SKILL.md format, frontmatter rules, and progressive-disclosure
loading model.

## Submitting a pull request

1. **Open an issue first** for non-trivial changes so we can discuss the
   approach. (Typo fixes, small docs edits, and obvious bug fixes don't
   need an issue.)
2. **Branch from `main`**. Name branches descriptively:
   `fix/streaming-deadlock`, `feat/sse-reconnect`, `docs/clarify-skills`.
3. **Run `npm run lint` and `npm test`** before pushing. CI runs both on
   every PR; failing lint is treated the same as failing tests.
4. **Write a clear PR description**. Include:
   - What the change does
   - Why it's needed
   - How you verified it (commands run, screenshots if UI)
   - Any follow-ups you noticed but deliberately deferred
5. **One logical change per PR**. If you find an unrelated bug while
   working on a feature, file a separate issue or send a separate PR.
6. **Update the docs** when behaviour changes — especially
   [docs/03-tools-and-skills.md](./docs/03-tools-and-skills.md) for any
   change to skills, function tools, MCP, or the built-in tool catalogue.

## Reporting bugs and asking questions

- **Bugs** → open an issue using the Bug Report template.
- **Feature ideas** → open an issue using the Feature Request template.
- **Security issues** → see [SECURITY.md](./SECURITY.md); do NOT open a
  public issue for vulnerabilities.

## Code of Conduct

By participating in this project you agree to abide by the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contributions will be licensed under the
same MIT License that covers the project — see [LICENSE](./LICENSE).
