import { Langfuse } from 'langfuse';
import { getSetting } from './db';
import type { AgentStepTrace, TokenUsage } from './agent';

let client: Langfuse | null = null;
let clientKey = '';

type LangfuseGeneration = ReturnType<Langfuse['generation']>;
type LangfuseTrace = ReturnType<Langfuse['trace']>;

export function isLangfuseEnabled(): boolean {
  return getSetting('langfuse_enabled') === 'true';
}

function getConfig() {
  return {
    publicKey: getSetting('langfuse_public_key') || process.env.LANGFUSE_PUBLIC_KEY || '',
    secretKey: getSetting('langfuse_secret_key') || process.env.LANGFUSE_SECRET_KEY || '',
    baseUrl: getSetting('langfuse_base_url') || process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
  };
}

function getClient(): Langfuse | null {
  if (!isLangfuseEnabled()) return null;
  const config = getConfig();
  if (!config.publicKey || !config.secretKey) return null;

  const key = `${config.publicKey}:${config.secretKey}:${config.baseUrl}`;
  if (!client || clientKey !== key) {
    client = new Langfuse({ publicKey: config.publicKey, secretKey: config.secretKey, baseUrl: config.baseUrl });
    clientKey = key;
  }
  return client;
}

export function createAgentTrace(params: {
  sessionId?: string;
  agentName?: string;
  modelId: string;
  promptPreview?: string;
}): LangfuseTrace | null {
  const lf = getClient();
  if (!lf) return null;
  try {
    return lf.trace({
      name: 'agentprimer-chat-turn',
      sessionId: params.sessionId,
      input: params.promptPreview,
      metadata: {
        agentName: params.agentName,
        modelId: params.modelId,
      },
      tags: ['agentprimer', 'agent-loop'],
    });
  } catch (err) {
    console.warn('[langfuse] trace creation failed:', err);
    return null;
  }
}

export function startGeneration(params: {
  trace: LangfuseTrace | null;
  name: string;
  model: string;
  input: unknown;
  metadata?: Record<string, unknown>;
}): LangfuseGeneration | null {
  if (!params.trace) return null;
  try {
    return params.trace.generation({
      name: params.name,
      model: params.model,
      input: params.input,
      metadata: params.metadata,
    });
  } catch (err) {
    console.warn('[langfuse] generation start failed:', err);
    return null;
  }
}

export function endGeneration(params: {
  generation: LangfuseGeneration | null;
  output: unknown;
  usage?: TokenUsage;
  metadata?: Record<string, unknown>;
}): void {
  if (!params.generation) return;
  try {
    params.generation.end({
      output: params.output,
      usage: params.usage ? {
        promptTokens: params.usage.input,
        completionTokens: params.usage.output,
        totalTokens: params.usage.input + params.usage.output,
      } : undefined,
      metadata: params.metadata,
    });
  } catch (err) {
    console.warn('[langfuse] generation end failed:', err);
  }
}

export async function finalizeTrace(params: {
  trace: LangfuseTrace | null;
  output: string;
  traceData: AgentStepTrace[];
}): Promise<void> {
  const lf = getClient();
  if (!lf || !params.trace) return;
  try {
    params.trace.update({
      output: params.output,
      metadata: { steps: params.traceData },
    });
    await lf.flushAsync();
  } catch (err) {
    console.warn('[langfuse] flush failed:', err);
  }
}
