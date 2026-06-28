import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PREVIEW_SANDBOX,
  ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY,
  isActivePreviewContentType,
} from '../lib/preview-security';

describe('ACTIVE_PREVIEW_SANDBOX', () => {
  it('allows scripts/forms/popups/modals for interactive previews', () => {
    expect(ACTIVE_PREVIEW_SANDBOX).toContain('allow-scripts');
    expect(ACTIVE_PREVIEW_SANDBOX).toContain('allow-forms');
    expect(ACTIVE_PREVIEW_SANDBOX).toContain('allow-popups');
    expect(ACTIVE_PREVIEW_SANDBOX).toContain('allow-modals');
  });

  it('never grants same-origin access (would defeat the sandbox)', () => {
    expect(ACTIVE_PREVIEW_SANDBOX).not.toContain('allow-same-origin');
  });

  it('does not grant top-navigation capabilities', () => {
    expect(ACTIVE_PREVIEW_SANDBOX).not.toContain('allow-top-navigation');
  });
});

describe('ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY', () => {
  const directives = ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY.split(';').map(d => d.trim());

  it('embeds the sandbox directive', () => {
    expect(directives).toContain(`sandbox ${ACTIVE_PREVIEW_SANDBOX}`);
  });

  it('defaults to denying everything', () => {
    expect(directives).toContain("default-src 'none'");
  });

  it('blocks all network egress via connect-src none', () => {
    expect(directives).toContain("connect-src 'none'");
  });

  it('restricts image/media sources to inline data and blobs only', () => {
    expect(directives).toContain('img-src data: blob:');
    expect(directives).toContain('media-src data: blob:');
  });

  it('does not allow loading scripts from arbitrary remote origins', () => {
    const scriptSrc = directives.find(d => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toMatch(/https?:/);
    expect(scriptSrc).not.toContain('*');
  });

  it('confines framing to the same origin', () => {
    expect(directives).toContain("frame-ancestors 'self'");
  });
});

describe('isActivePreviewContentType', () => {
  it('treats HTML as an active (script-capable) preview', () => {
    expect(isActivePreviewContentType('text/html')).toBe(true);
    expect(isActivePreviewContentType('text/html; charset=utf-8')).toBe(true);
  });

  it('treats SVG as active because it can carry scripts', () => {
    expect(isActivePreviewContentType('image/svg+xml')).toBe(true);
  });

  it('treats inert content types as not active', () => {
    expect(isActivePreviewContentType('text/plain')).toBe(false);
    expect(isActivePreviewContentType('application/json')).toBe(false);
    expect(isActivePreviewContentType('image/png')).toBe(false);
    expect(isActivePreviewContentType('')).toBe(false);
  });

  it('does not match a charset-suffixed svg (exact match required)', () => {
    // SVG is only matched exactly, so a parameterised svg content type is inert.
    expect(isActivePreviewContentType('image/svg+xml; charset=utf-8')).toBe(false);
  });
});
