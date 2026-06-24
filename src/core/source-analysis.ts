/**
 * Lightweight source lexer for static export analysis.
 * Avoids AST dependencies — same approach as unplugin-react-router-dom source-analysis.
 */

export function isIdentifierChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_$]/.test(ch)
}

function blankSegment(segment: string): string {
  return segment.replace(/[^\n\r]/g, ' ')
}

export function skipQuoted(source: string, start: number, quote: "'" | '"'): number {
  let i = start + 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') { i += 2; continue }
    if (ch === quote) return i + 1
    i++
  }
  return i
}

export function skipLineComment(source: string, start: number): number {
  let i = start + 2
  while (i < source.length && source[i] !== '\n') i++
  return i
}

export function skipBlockComment(source: string, start: number): number {
  const end = source.indexOf('*/', start + 2)
  return end === -1 ? source.length : end + 2
}

export function skipTemplate(source: string, start: number): number {
  let i = start + 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') { i += 2; continue }
    if (ch === '`') return i + 1
    if (ch === '$' && source[i + 1] === '{') {
      i = skipBalanced(source, i + 2, '{', '}')
      continue
    }
    i++
  }
  return i
}

export function skipBalanced(source: string, start: number, open: string, close: string): number {
  let depth = 1
  let i = start
  while (i < source.length && depth > 0) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === "'" || ch === '"') { i = skipQuoted(source, i, ch); continue }
    if (ch === '`') { i = skipTemplate(source, i); continue }
    if (ch === '/' && next === '/') { i = skipLineComment(source, i); continue }
    if (ch === '/' && next === '*') { i = skipBlockComment(source, i); continue }
    if (ch === open) depth++
    else if (ch === close) depth--
    i++
  }
  return i
}

export function maskNonCode(source: string): string {
  let result = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === "'" || ch === '"') {
      const end = skipQuoted(source, i, ch)
      result += blankSegment(source.slice(i, end))
      i = end
      continue
    }
    if (ch === '`') {
      const end = skipTemplate(source, i)
      result += blankSegment(source.slice(i, end))
      i = end
      continue
    }
    if (ch === '/' && next === '/') {
      const end = skipLineComment(source, i)
      result += blankSegment(source.slice(i, end))
      i = end
      continue
    }
    if (ch === '/' && next === '*') {
      const end = skipBlockComment(source, i)
      result += blankSegment(source.slice(i, end))
      i = end
      continue
    }
    result += ch
    i++
  }
  return result
}

export function skipIgnorable(source: string, start: number): number {
  let i = start
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '/' && next === '/') { i = skipLineComment(source, i); continue }
    if (ch === '/' && next === '*') { i = skipBlockComment(source, i); continue }
    break
  }
  return i
}

export function readStringLiteral(source: string, start: number): { value: string; end: number } | null {
  const quote = source[start]
  if (quote !== '"' && quote !== "'" && quote !== '`') return null
  let value = ''
  let i = start + 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') {
      const next = source[i + 1]
      if (next === undefined) return null
      value += next
      i += 2
      continue
    }
    if (quote === '`' && ch === '$' && source[i + 1] === '{') return null
    if (ch === quote) return { value, end: i + 1 }
    if ((quote === '"' || quote === "'") && (ch === '\n' || ch === '\r')) return null
    value += ch
    i++
  }
  return null
}
