import type { RouteMeta } from '../types'
import {
  isIdentifierChar,
  maskNonCode,
  readStringLiteral,
  skipBalanced,
  skipIgnorable,
} from './source-analysis'

function readIdentifierKey(source: string, start: number): { key: string; end: number } | null {
  const ch = source[start]
  if (isIdentifierChar(ch)) {
    let j = start + 1
    while (isIdentifierChar(source[j])) j++
    return { key: source.slice(start, j), end: j }
  }
  const literal = readStringLiteral(source, start)
  if (literal) return { key: literal.value, end: literal.end }
  return null
}

function readPrimitiveValue(
  source: string,
  start: number,
): { value: string | number | boolean; end: number } | null {
  let i = skipIgnorable(source, start)
  const literal = readStringLiteral(source, i)
  if (literal) return { value: literal.value, end: literal.end }

  if (source.startsWith('true', i) && !isIdentifierChar(source[i + 4])) {
    return { value: true, end: i + 4 }
  }
  if (source.startsWith('false', i) && !isIdentifierChar(source[i + 5])) {
    return { value: false, end: i + 5 }
  }

  const numMatch = source.slice(i).match(/^-?\d+(?:\.\d+)?/)
  if (numMatch) {
    const raw = numMatch[0]
    const end = i + raw.length
    if (!isIdentifierChar(source[end])) {
      return { value: Number(raw), end }
    }
  }

  return null
}

/**
 * Extract static `export const meta = { ... }` object fields.
 * Only primitive values are supported — sufficient for title / auth / page id.
 */
export function readStaticMeta(source: string): RouteMeta | undefined {
  const masked = maskNonCode(source)
  const metaExport = /\bexport\s+const\s+meta\s*=\s*\{/g
  let match: RegExpExecArray | null
  while ((match = metaExport.exec(masked)) !== null) {
    const braceIndex = match.index + match[0].length - 1
    const end = skipBalanced(source, braceIndex + 1, '{', '}')
    if (end > source.length || source[end - 1] !== '}') continue

    const meta: RouteMeta = {}
    let i = braceIndex + 1
    while (i < end - 1) {
      i = skipIgnorable(source, i)
      if (i >= end - 1) break
      if (source[i] === ',') { i++; continue }

      const keyInfo = readIdentifierKey(source, i)
      if (!keyInfo) { i++; continue }
      i = skipIgnorable(source, keyInfo.end)
      if (source[i] !== ':') { i++; continue }
      i = skipIgnorable(source, i + 1)

      const valueInfo = readPrimitiveValue(source, i)
      if (valueInfo) {
        meta[keyInfo.key] = valueInfo.value
        i = skipIgnorable(source, valueInfo.end)
        continue
      }
      i++
    }

    return Object.keys(meta).length > 0 ? meta : undefined
  }
  return undefined
}

export function hasDefaultExport(source: string): boolean {
  return /\bexport\s+default\b/.test(maskNonCode(source))
}
