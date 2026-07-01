import { NextResponse } from 'next/server';
import { getSourceContent, getSourceMeta } from '@/lib/rag';
import { getSessionUser } from '@/lib/auth';

/**
 * GET /api/rag/sources/[id]/content
 * ---------------------------------------------------------------------------
 * Return the original document for the RAG page's View panel.
 *
 *   ?meta=1                    → JSON { id, name, mime } only — NO content.
 *                                Used by the viewer for PDFs (which then
 *                                stream via ?raw=1) so the page doesn't
 *                                download multi-MB base64 just to read mime.
 *   ?raw=1                     → respond with the raw bytes. PDFs use the
 *                                stored Content-Type so an <iframe> renders
 *                                them natively. Other types (markdown / html
 *                                / plain text) are intentionally served as
 *                                `text/plain` with `X-Content-Type-Options:
 *                                nosniff` and `Content-Disposition: attachment`
 *                                so user-supplied HTML cannot run scripts on
 *                                the app's own origin (stored XSS sink).
 *   otherwise                  → JSON { id, name, mime, content }. `content`
 *                                is verbatim text for text/markdown/html
 *                                sources; PDFs are not returned through this
 *                                path (use ?raw=1).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const url = new URL(req.url);
  const raw = url.searchParams.get('raw') === '1';
  const meta = url.searchParams.get('meta') === '1';

  // Metadata-only path — small SELECT, no large content load.
  if (meta) {
    const m = getSourceMeta(numId);
    if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(m);
  }

  const src = getSourceContent(numId);
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (raw) {
    if (src.mime === 'application/pdf') {
      const bytes = src.bytes ?? Buffer.from(src.content, 'base64');
      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(bytes.length),
          'Cache-Control': 'private, max-age=0, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    // Non-PDF raw downloads are forced to text/plain + nosniff +
    // Content-Disposition: attachment so a malicious uploaded HTML cannot
    // execute scripts on the app's origin if the user opens this URL
    // directly. The View panel renders HTML inside a sandboxed iframe via
    // the JSON path instead.
    const filename = src.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'document';
    return new Response(src.content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="${filename}.txt"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  }

  // JSON envelope: never include the binary blob; PDFs are too big and the
  // raw path is the right consumer for them anyway.
  if (src.mime === 'application/pdf') {
    return NextResponse.json({ id: src.id, name: src.name, mime: src.mime, content: '' });
  }
  return NextResponse.json({ id: src.id, name: src.name, mime: src.mime, content: src.content });
}
