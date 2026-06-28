/**
 * lib/agent/model-resolver.ts
 * ---------------------------------------------------------------------------
 * Resolve the LLM model to use for a turn, including a short-lived cache of
 * the provider's /v1/models list so an agent-pinned `Model:` in agent.md is
 * validated before we fire the chat request.
 */
import { getSetting } from '../db';
import { fetchAvailableModels } from './openai-client';

const MODEL_LIST_CACHE_TTL_MS = 60_000;
let modelListCache: { key: string; expires: number; ids: Set<string> } | null = null;

export async function getAvailableModelIds(): Promise<Set<string> | null> {
  const endpoint = getSetting('endpoint') ?? '';
  const apiKey = getSetting('api_key') ?? '';
  const key = `${endpoint}|${apiKey}`;
  const now = Date.now();

  if (modelListCache && modelListCache.key === key && modelListCache.expires > now) {
    return modelListCache.ids;
  }

  try {
    const list = await fetchAvailableModels();
    const ids = new Set(list.map((m) => m.id));
    modelListCache = { key, expires: now + MODEL_LIST_CACHE_TTL_MS, ids };
    return ids;
  } catch {
    // Provider unreachable — don't pretend the model is invalid, just skip
    // validation this turn so the request still has a chance to succeed.
    return null;
  }
}

/**
 * Resolve the model to use for this turn, falling back to the Settings default
 * when the agent pins a model that doesn't exist on the configured endpoint.
 *
 * Priority: UI override > agent.md **Model:** > Settings → Default Model.
 * Returns '' when nothing is configured so the caller can emit the
 * "no model configured" stream.
 */
export async function resolveModelWithFallback(
  uiOverride: string | undefined,
  agentModel: string | undefined,
  agentName: string,
): Promise<string> {
  // UI override always wins — the user explicitly picked it, trust it.
  if (uiOverride) return uiOverride;

  const settingsDefault = getSetting('default_model') ?? '';

  if (agentModel) {
    // Validate the agent-pinned model against the provider's catalogue. We
    // only fall through when we can prove the model is missing — if the
    // provider is unreachable, getAvailableModelIds returns null and we
    // trust the agent's choice rather than silently overriding it.
    const available = await getAvailableModelIds();
    if (available === null || available.has(agentModel)) {
      return agentModel;
    }
    console.warn(
      `Agent "${agentName}" specifies model "${agentModel}" which is not ` +
        `available on the configured endpoint. Falling back to the Settings default ` +
        `("${settingsDefault || '<unset>'}").`,
    );
    return settingsDefault;
  }

  return settingsDefault;
}
