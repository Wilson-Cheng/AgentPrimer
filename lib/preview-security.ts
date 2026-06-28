export const ACTIVE_PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-popups allow-modals';

export const ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY = [
  `sandbox ${ACTIVE_PREVIEW_SANDBOX}`,
  "default-src 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline' blob:",
  "connect-src 'none'",
  "font-src data:",
  "frame-ancestors 'self'",
].join('; ');

export function isActivePreviewContentType(contentType: string): boolean {
  return contentType.startsWith('text/html') || contentType === 'image/svg+xml';
}
