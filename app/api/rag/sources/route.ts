import { NextResponse } from 'next/server';
import { listSources, ingestDocument } from '@/lib/rag';
import { getSessionUser } from '@/lib/auth';
import { execSync } from 'child_process';

// ── GET — list knowledge sources ──────────────────────────────────────────────

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ sources: listSources() });
}

// ── POST — ingest a document ──────────────────────────────────────────────────
// Accepts either:
//   multipart/form-data:  name (string) + file (File) [text/plain, text/markdown, application/pdf]
//   application/json:     { name: string; content: string; source_type?: string }

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ct = req.headers.get('content-type') ?? '';

  let name: string;
  let content: string;
  let sourceType = 'file_upload';
  let originalContent: string | undefined;
  let originalBytes:   Buffer    | undefined;
  let originalMime:    string    | undefined;

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

    const nameField = form.get('name');
    const fileField = form.get('file');

    if (!fileField || !(fileField instanceof File)) {
      return NextResponse.json({ error: 'file field is required' }, { status: 400 });
    }

    name = typeof nameField === 'string' && nameField.trim()
      ? nameField.trim()
      : fileField.name;

    let extracted: ExtractResult;
    try {
      extracted = await extractFileContent(fileField);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
    content         = extracted.text;
    originalContent = extracted.original;
    originalBytes   = extracted.bytes;
    originalMime    = extracted.mime;
    sourceType = 'file_upload';
  } else {
    // JSON body
    const body = await req.json().catch(() => null) as {
      name?: string;
      content?: string;
      source_type?: string;
      original_mime?: string;
    } | null;

    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    if (!body.name?.trim())    return NextResponse.json({ error: 'name is required' },    { status: 400 });
    if (!body.content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 });

    name       = body.name.trim();
    content    = body.content;
    sourceType = body.source_type ?? 'paste';
    originalContent = body.content;
    originalMime    = body.original_mime ?? 'text/plain';
  }

  if (!content.trim()) {
    return NextResponse.json({ error: 'Document is empty or could not be read' }, { status: 400 });
  }

  try {
    const result = await ingestDocument({
      name, sourceType, content,
      originalContent, originalBytes, originalMime,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── File content extraction ───────────────────────────────────────────────────

interface ExtractResult {
  text:      string;
  /** Verbatim text for text/markdown/html sources. Empty for PDFs. */
  original?: string;
  /** Raw bytes for PDFs. Undefined for text. */
  bytes?:    Buffer;
  mime:      string;
}

/** Allowed text mimes (anything else without a `.pdf` extension is rejected
 *  so the View panel never tries to render a lossy UTF-8 decode of binary
 *  bytes, e.g. .docx / .xlsx / images mislabelled as text). */
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'html', 'htm',
  'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'log',
]);

function extToMime(ext: string, fallbackType: string): string {
  if (ext === 'md' || ext === 'markdown')   return 'text/markdown';
  if (ext === 'html' || ext === 'htm')      return 'text/html';
  if (ext === 'json')                       return 'application/json';
  if (ext === 'csv' || ext === 'tsv')       return 'text/csv';
  if (ext === 'xml')                        return 'application/xml';
  if (ext === 'yaml' || ext === 'yml')      return 'text/yaml';
  if (fallbackType && fallbackType.startsWith('text/')) return fallbackType;
  return 'text/plain';
}

async function extractFileContent(file: File): Promise<ExtractResult> {
  const buf   = Buffer.from(await file.arrayBuffer());
  const lname = file.name.toLowerCase();
  const ext   = lname.includes('.') ? lname.slice(lname.lastIndexOf('.') + 1) : '';

  if (ext === 'pdf' || file.type === 'application/pdf') {
    return {
      text:  extractPdf(buf),
      bytes: buf,
      mime:  'application/pdf',
    };
  }

  // Reject anything that isn't a known text type. The previous behaviour was
  // `buf.toString('utf8')` which silently corrupted any non-UTF-8 file (docx,
  // xlsx, images) and the new View panel would then render garbled bytes.
  if (!TEXT_EXTS.has(ext) && !file.type.startsWith('text/')) {
    throw new Error(
      `Unsupported file type ".${ext || file.type || 'unknown'}". ` +
      `Allowed: PDF or text (txt, md, html, csv, json, yaml, xml).`,
    );
  }

  const text = buf.toString('utf8');
  return { text, original: text, mime: extToMime(ext, file.type) };
}

function extractPdf(buf: Buffer): string {
  try {
    // pdftotext is available in the Docker image (poppler-utils)
    const text = execSync('pdftotext -layout -enc UTF-8 - -', {
      input:     buf,
      maxBuffer: 10 * 1024 * 1024,
      timeout:   30_000,
    }).toString('utf8');
    if (!text.trim()) throw new Error('pdftotext returned empty output');
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Could not extract text from PDF: ${msg}. ` +
      `Try pasting the text directly instead.`
    );
  }
}
