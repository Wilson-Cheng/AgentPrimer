export const ACTIVE_PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-popups allow-modals';

function previewAssetSources(origin?: string): string {
  if (!origin) return "'self'";
  try {
    return `'self' ${new URL(origin).origin}`;
  } catch {
    return "'self'";
  }
}

export function activePreviewContentSecurityPolicy(origin?: string): string {
  const assetSources = previewAssetSources(origin);
  return [
    `sandbox ${ACTIVE_PREVIEW_SANDBOX}`,
    "default-src 'none'",
    `img-src ${assetSources} data: blob:`,
    `media-src ${assetSources} data: blob:`,
    `style-src ${assetSources} 'unsafe-inline'`,
    `script-src ${assetSources} 'unsafe-inline' 'unsafe-eval' blob:`,
    `connect-src ${assetSources}`,
    `font-src ${assetSources} data:`,
    "frame-ancestors 'self'",
  ].join('; ');
}

export const ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY = activePreviewContentSecurityPolicy();

export function isSameOriginPreviewAssetRequest(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.startsWith('/api/workspace/') && !requestUrl.pathname.startsWith('/api/editor/preview/')) return false;

  const referrer = request.headers.get('referer');
  if (referrer) {
    try {
      const referrerUrl = new URL(referrer);
      return requestUrl.origin === referrerUrl.origin
        && (referrerUrl.pathname.startsWith('/api/workspace/') || referrerUrl.pathname.startsWith('/api/editor/preview/'));
    } catch {
      return false;
    }
  }

  return request.headers.get('sec-fetch-dest') === 'script'
    || request.headers.get('sec-fetch-dest') === 'style'
    || request.headers.get('sec-fetch-dest') === 'image'
    || request.headers.get('sec-fetch-dest') === 'font'
    || request.headers.get('sec-fetch-dest') === 'empty';
}

export function isActivePreviewContentType(contentType: string): boolean {
  return contentType.startsWith('text/html') || contentType === 'image/svg+xml';
}

export const PREVIEW_STORAGE_SHIM = `<script>(()=>{function s(){const m=new Map;return{get length(){return m.size},key:i=>Array.from(m.keys())[i]??null,getItem:k=>m.has(String(k))?m.get(String(k)):null,setItem:(k,v)=>{m.set(String(k),String(v))},removeItem:k=>{m.delete(String(k))},clear:()=>{m.clear()}}}for(const k of ['localStorage','sessionStorage']){try{window[k]}catch{Object.defineProperty(window,k,{value:s(),configurable:true})}}})();</script>`;

export function injectPreviewStorageShim(contentType: string, content: string): string {
  if (!contentType.startsWith('text/html')) return content;
  if (content.includes('localStorage') || content.includes('sessionStorage')) {
    return content.replace(/<head(\s[^>]*)?>/i, match => `${match}${PREVIEW_STORAGE_SHIM}`);
  }
  return content;
}
