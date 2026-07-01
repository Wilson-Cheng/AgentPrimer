import { fetchAvailableModels } from '@/lib/agent';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// GET /api/models — fetch models using saved endpoint / API key
export async function GET() {
  try {
    const modelList = await fetchAvailableModels();
    const models = modelList.map((m) => m.id);
    const details: Record<string, { context_length?: number; max_output_tokens?: number }> = {};
    for (const m of modelList) {
      details[m.id] = { context_length: m.context_length, max_output_tokens: m.max_output_tokens };
    }
    return NextResponse.json({ models, details });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

// POST /api/models { endpoint, api_key } — probe a (possibly unsaved) endpoint
export async function POST(request: NextRequest) {
  try {
    const { endpoint, api_key } = await request.json().catch(() => ({}));
    const modelList = await fetchAvailableModels(endpoint, api_key);
    const models = modelList.map((m) => m.id);
    const details: Record<string, { context_length?: number; max_output_tokens?: number }> = {};
    for (const m of modelList) {
      details[m.id] = { context_length: m.context_length, max_output_tokens: m.max_output_tokens };
    }
    return NextResponse.json({ models, details });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
