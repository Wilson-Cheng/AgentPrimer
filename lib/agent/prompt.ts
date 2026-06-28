/**
 * lib/agent/prompt.ts
 * ---------------------------------------------------------------------------
 * Compose the final system prompt sent to the LLM.
 */
import { readSystemPrompt } from '../memory';
import type { AgentNotification } from '../db';

/**
 * Compose the final system prompt.
 *
 * Inputs (in order, joined with `\n\n---\n\n` separators when both sides
 * are non-empty):
 *
 *   1. `system.md` content (global preamble — user-editable).
 *   2. The active agent's own prompt from agent.md.
 *   3. Persistent memory (`agents/<agent>/memory.md`) — wrapped in a
 *      `## Persistent Memory` heading, included only when non-empty.
 *   4. Pending task notifications — included only when present.
 *
 * Crucially this function does NOT inject any hardcoded platform copy.
 * Built-in tool documentation (Preview Panel, async sub-agents, etc.)
 * lives in `defaults/system.md` so the user can edit, trim, or remove it.
 * When the user wipes `system.md`, sets an empty agent prompt, and clears
 * memory, the resulting system message is genuinely empty — only the
 * user's actual messages travel to the LLM API.
 *
 * Reads system.md fresh on every call — no caching.
 */
export function buildSystemPrompt(
  agentSystemPrompt: string,
  memory: string,
  pendingNotifications?: AgentNotification[],
): string {
  const sep = '\n\n---\n\n';
  const parts: string[] = [];

  // 1. Global system.md preamble.
  const systemBase = readSystemPrompt().trim();
  if (systemBase) parts.push(systemBase);

  // 2. Active agent's own prompt (may also be empty for a stripped-down
  //    "raw" agent the user wants to test the model with).
  const agentPart = agentSystemPrompt.trim();
  if (agentPart) parts.push(agentPart);

  // 3. Persistent memory — only when there's actually something to share.
  //    The heading is structural so the model knows "this block is my
  //    memory"; we add it inline (not as a separate `parts` entry) so an
  //    empty memory contributes literally nothing.
  const memoryPart = memory.trim();
  if (memoryPart) {
    parts.push(
      `## Persistent Memory\n\nThe following is your persistent memory — information stored from previous conversations:\n\n${memoryPart}`,
    );
  }

  // 4. Pending sub-agent notifications.
  if (pendingNotifications?.length) {
    const list = pendingNotifications
      .map(
        (n) =>
          `- **Task** \`${n.task_id}\` (${n.summary.startsWith('ERROR') ? 'error' : 'finished'}): ${n.summary.slice(0, 200)}\n  → Task file: \`${n.task_file}\``,
      )
      .join('\n');
    parts.push(
      `## Pending Task Notifications\n\nThe following async sub-agent tasks completed while you were away. Read each task file for full details, then continue your work:\n\n${list}`,
    );
  }

  return parts.join(sep);
}
