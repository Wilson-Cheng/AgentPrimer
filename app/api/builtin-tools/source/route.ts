import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

/**
 * GET /api/builtin-tools/source?id=<tool_id>
 *
 * Reads lib/agent/builtin-tools.ts and extracts the source block for the
 * requested tool. The block starts at `  <id>: tool({` and ends at the
 * matching `    }),`.
 *
 * Note: the built-in tool definitions used to live in lib/agent.ts, which is
 * now just a barrel re-export. They moved to lib/agent/builtin-tools.ts during
 * the agent module refactor.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id || !/^[a-z_]+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const toolsPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    'lib',
    'agent',
    'builtin-tools.ts',
  );
  let source: string;
  try {
    source = fs.readFileSync(toolsPath, 'utf8');
  } catch {
    return NextResponse.json({ error: 'could not read builtin-tools.ts' }, { status: 500 });
  }

  const lines = source.split('\n');

  // Find the start line: `    <id>: tool({`
  const startIdx = lines.findIndex(l => new RegExp(`^\\s+${id}:\\s*tool\\s*\\(`).test(l));
  if (startIdx === -1) {
    return NextResponse.json({ error: 'tool not found' }, { status: 404 });
  }

  // Walk forward tracking brace depth to find the end of the block (`    }),`)
  let depth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '(' || ch === '{') depth++;
      if (ch === ')' || ch === '}') depth--;
    }
    endIdx = i;
    // After we've opened at least 1 level, wait until depth returns to 0 then
    // include the closing `}),` line.
    if (i > startIdx && depth <= 0) break;
  }

  const snippet = lines.slice(startIdx, endIdx + 1).join('\n');
  return NextResponse.json({ id, snippet });
}
