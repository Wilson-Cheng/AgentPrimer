import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PREVIEW_SANDBOX,
  ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY,
  activePreviewContentSecurityPolicy,
  injectPreviewStorageShim,
  isActivePreviewContentType,
  isSameOriginPreviewAssetRequest,
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

  it('allows same-origin connect requests for preview source maps and local fetches', () => {
    expect(directives).toContain("connect-src 'self'");
  });

  it('allows same-origin images/media while preserving inline data and blobs', () => {
    expect(directives).toContain("img-src 'self' data: blob:");
    expect(directives).toContain("media-src 'self' data: blob:");
  });

  it('allows same-origin styles and scripts for relative preview assets and in-browser Babel', () => {
    expect(directives).toContain("style-src 'self' 'unsafe-inline'");
    expect(directives).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:");
  });

  it('does not allow loading scripts from arbitrary remote origins', () => {
    const scriptSrc = directives.find(d => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toMatch(/https?:/);
    expect(scriptSrc).not.toContain('*');
  });

  it('can include the concrete preview origin for sandboxed same-domain assets', () => {
    const originDirectives = activePreviewContentSecurityPolicy('http://localhost:15432').split(';').map(d => d.trim());
    expect(originDirectives).toContain("style-src 'self' http://localhost:15432 'unsafe-inline'");
    expect(originDirectives).toContain("script-src 'self' http://localhost:15432 'unsafe-inline' 'unsafe-eval' blob:");
    expect(originDirectives).toContain("connect-src 'self' http://localhost:15432");
  });

  it('ignores invalid dynamic origins', () => {
    const originDirectives = activePreviewContentSecurityPolicy('not a url').split(';').map(d => d.trim());
    expect(originDirectives).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:");
  });

  it('confines framing to the same origin', () => {
    expect(directives).toContain("frame-ancestors 'self'");
  });
});

describe('isSameOriginPreviewAssetRequest', () => {
  it('allows GET assets referenced by same-origin workspace previews', () => {
    const request = new Request('http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/react.production.min.js', {
      headers: { referer: 'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/index.html' },
    });
    expect(isSameOriginPreviewAssetRequest(request)).toBe(true);
  });

  it('allows GET assets referenced by same-origin editor previews', () => {
    const request = new Request('http://localhost:15432/api/editor/preview/app/react.production.min.js', {
      headers: { referer: 'http://localhost:15432/api/editor/preview/app/index.html' },
    });
    expect(isSameOriginPreviewAssetRequest(request)).toBe(true);
  });

  it('rejects cross-origin referrers and non-preview referrers', () => {
    const crossOrigin = new Request('http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/react.production.min.js', {
      headers: { referer: 'http://example.com/api/workspace/workspaces/AgentPrimer/data/app/index.html' },
    });
    const nonPreview = new Request('http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/react.production.min.js', {
      headers: { referer: 'http://localhost:15432/' },
    });
    expect(isSameOriginPreviewAssetRequest(crossOrigin)).toBe(false);
    expect(isSameOriginPreviewAssetRequest(nonPreview)).toBe(false);
  });

  it('allows sandboxed iframe script assets that omit referrer and cookies', () => {
    const request = new Request('http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/projects/react-todo-demo/react.production.min.js', {
      headers: {
        'sec-fetch-dest': 'script',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site',
      },
    });
    expect(isSameOriginPreviewAssetRequest(request)).toBe(true);
  });

  it('allows sandboxed iframe style, image, font, and source map assets that omit referrer', () => {
    for (const dest of ['style', 'image', 'font', 'empty']) {
      const request = new Request(`http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/projects/react-todo-demo/asset-${dest}`, {
        headers: { 'sec-fetch-dest': dest },
      });
      expect(isSameOriginPreviewAssetRequest(request)).toBe(true);
    }
  });

  it('rejects no-referrer preview document requests', () => {
    const request = new Request('http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/projects/react-todo-demo/page2.html', {
      headers: { 'sec-fetch-dest': 'iframe' },
    });
    expect(isSameOriginPreviewAssetRequest(request)).toBe(false);
  });

  it('rejects requests without a referrer or recognized asset destination, and non-GET methods', () => {
    const noReferrer = new Request('http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/react.production.min.js');
    const post = new Request('http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/react.production.min.js', {
      method: 'POST',
      headers: { referer: 'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/index.html' },
    });
    expect(isSameOriginPreviewAssetRequest(noReferrer)).toBe(false);
    expect(isSameOriginPreviewAssetRequest(post)).toBe(false);
  });
});

describe('injectPreviewStorageShim', () => {
  it('injects a storage shim into HTML that references localStorage', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body><script>localStorage.getItem("x")</script></body></html>';
    const result = injectPreviewStorageShim('text/html; charset=utf-8', html);
    expect(result).toContain('localStorage');
    expect(result).toContain('Object.defineProperty(window,k');
    expect(result.indexOf('<head>')).toBeLessThan(result.indexOf('Object.defineProperty'));
  });

  it('does not inject into inert or storage-free content', () => {
    expect(injectPreviewStorageShim('text/plain', 'localStorage')).toBe('localStorage');
    expect(injectPreviewStorageShim('text/html', '<html><head></head><body></body></html>')).toBe('<html><head></head><body></body></html>');
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
