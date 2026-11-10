const MAX_BOOTSTRAP_CHARACTERS = 16 * 1024 * 1024;
const VERSION = '(?:main|v?\\d{1,5}\\.\\d{1,5}\\.\\d{1,5}(?:-[A-Za-z0-9][A-Za-z0-9.-]{0,49})?)';
const RESOURCE = new RegExp(`^/docs/[a-z][a-z0-9-]{0,39}/${VERSION}(?:/pages/[a-z0-9][a-z0-9-]{0,79}|/api\\?symbol=[A-Za-z0-9_.!~*'()%+-]+)?$`);

/** textContent of the inert template is decoded by the HTML parser, never evaluated. */
export function parseDocumentationBootstrap(text) {
  if (typeof text !== 'string' || text.length > MAX_BOOTSTRAP_CHARACTERS) return new Map();
  try {
    const value = JSON.parse(text);
    if (value?.schemaVersion !== 1 || typeof value.pathname !== 'string' || !Array.isArray(value.resources) || value.resources.length > 3) return new Map();
    const resources = new Map();
    for (const entry of value.resources) {
      if (!entry || typeof entry.path !== 'string' || entry.path.length > 10000 || !RESOURCE.test(entry.path) || !entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data) || resources.has(entry.path)) return new Map();
      resources.set(entry.path,entry.data);
    }
    return resources;
  } catch { return new Map(); }
}

let bootstrap;
/** Remains outside #root so lazy reader modules can load after React starts. */
export function readDocumentationBootstrap(path) {
  if (!bootstrap) {
    if (typeof document === 'undefined') return undefined;
    const template = document.getElementById('pustka-doc-bootstrap');
    bootstrap = parseDocumentationBootstrap(template?.content?.textContent || '');
    template?.remove();
  }
  return bootstrap.get(path);
}

/** A committed reader owns its initial data; later mounts use the normal API. */
export function consumeDocumentationBootstrap(path) {
  bootstrap?.delete(path);
}
