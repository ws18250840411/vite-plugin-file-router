/**
 * File-name → URL segment conversion.
 *
 * Conventions align with:
 * - Next.js App Router / Expo Router dynamic segments
 * - vite-plugin-pages bracket syntax
 * - unplugin-vue-router path parser
 */

export function isGroupDir(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')')
}

export function isCatchAllSegment(segment: string): boolean {
  return segment === '*' || segment === '*?'
}

/** Convert a file or directory name to a URL path segment. */
export function nameToSegment(name: string): string {
  // Optional catch-all: [[...slug]]
  if (name.startsWith('[[...') && name.endsWith(']]')) return '*?'
  // Catch-all: [...slug]
  if (name.startsWith('[...') && name.endsWith(']')) return '*'
  // Optional param: [[id]]
  if (name.startsWith('[[') && name.endsWith(']]')) return `:${name.slice(2, -2)}?`
  // Dynamic param: [id]
  if (name.startsWith('[') && name.endsWith(']')) return `:${name.slice(1, -1)}`
  // 404 aliases
  if (name === 'not-found' || name === '404') return '*'
  return name
}

export function joinUrlPath(base: string, segment: string): string {
  if (!base || base === '/') return `/${segment}`
  return `${base}/${segment}`
}

export function normalizeBaseRoute(base: string): string {
  if (!base || base === '/') return ''
  return base.startsWith('/') ? base.replace(/\/$/, '') : `/${base.replace(/\/$/, '')}`
}
