import { describe, expect, it } from 'vitest'

import {
  isIdentifierChar,
  maskNonCode,
  readStringLiteral,
  skipBalanced,
  skipBlockComment,
  skipIgnorable,
  skipLineComment,
  skipQuoted,
  skipTemplate,
} from '../core/source-analysis'
import { readRouteModuleExports } from '../core/route-module-reader'
import { hasDefaultExport, readStaticMeta } from '../core/meta-reader'

describe('source-analysis lexer', () => {
  it('isIdentifierChar recognizes valid chars', () => {
    expect(isIdentifierChar('a')).toBe(true)
    expect(isIdentifierChar('Z')).toBe(true)
    expect(isIdentifierChar('0')).toBe(true)
    expect(isIdentifierChar('_')).toBe(true)
    expect(isIdentifierChar('$')).toBe(true)
    expect(isIdentifierChar(' ')).toBe(false)
    expect(isIdentifierChar(undefined)).toBe(false)
  })

  it('skipQuoted skips single-quoted string', () => {
    const src = "'hello' rest"
    expect(skipQuoted(src, 0, "'")).toBe(7)
  })

  it('skipQuoted handles escaped chars', () => {
    const src = "'he\\'llo' rest"
    expect(skipQuoted(src, 0, "'")).toBe(9)
  })

  it('skipQuoted handles unterminated string', () => {
    const src = "'no closing quote"
    expect(skipQuoted(src, 0, "'")).toBe(src.length)
  })

  it('skipLineComment skips to newline', () => {
    const src = '// this is a comment\nnext'
    expect(skipLineComment(src, 0)).toBe(20)
  })

  it('skipBlockComment skips to end', () => {
    const src = '/* comment */ rest'
    expect(skipBlockComment(src, 0)).toBe(13)
  })

  it('skipBlockComment handles unterminated', () => {
    const src = '/* no end'
    expect(skipBlockComment(src, 0)).toBe(src.length)
  })

  it('skipTemplate skips template literal', () => {
    const src = '`hello ${name}` rest'
    expect(skipTemplate(src, 0)).toBe(15)
  })

  it('skipTemplate handles unterminated template', () => {
    const src = '`no closing backtick'
    expect(skipTemplate(src, 0)).toBe(src.length)
  })

  it('skipTemplate handles escaped backtick', () => {
    const src = '`he\\`llo` rest'
    expect(skipTemplate(src, 0)).toBe(9)
  })

  it('skipBalanced tracks depth', () => {
    const src = '{ a: { b: 1 } } rest'
    expect(skipBalanced(src, 1, '{', '}')).toBe(15)
  })

  it('maskNonCode blanks strings and comments', () => {
    const src = 'const x = "hello" // comment'
    const masked = maskNonCode(src)
    expect(masked).not.toContain('hello')
    expect(masked).not.toContain('comment')
    expect(masked).toContain('const x =')
  })

  it('maskNonCode blanks template literals', () => {
    const src = 'const x = `template`'
    const masked = maskNonCode(src)
    expect(masked).not.toContain('template')
    expect(masked).toContain('const x =')
  })

  it('maskNonCode blanks block comments', () => {
    const src = 'const x = /* hidden */ 42'
    const masked = maskNonCode(src)
    expect(masked).not.toContain('hidden')
    expect(masked).toContain('42')
  })

  it('skipIgnorable skips whitespace and comments', () => {
    const src = '  // comment\n  /* block */  code'
    const pos = skipIgnorable(src, 0)
    expect(src.slice(pos).startsWith('code')).toBe(true)
  })

  it('readStringLiteral reads double-quoted string', () => {
    const src = '"hello" rest'
    const result = readStringLiteral(src, 0)
    expect(result).toEqual({ value: 'hello', end: 7 })
  })

  it('readStringLiteral reads single-quoted string', () => {
    const src = "'world' rest"
    const result = readStringLiteral(src, 0)
    expect(result).toEqual({ value: 'world', end: 7 })
  })

  it('readStringLiteral handles escapes', () => {
    const src = '"he\\"llo"'
    const result = readStringLiteral(src, 0)
    expect(result).toEqual({ value: 'he"llo', end: 9 })
  })

  it('readStringLiteral returns null for template with interpolation', () => {
    const src = '`${x}`'
    const result = readStringLiteral(src, 0)
    expect(result).toBeNull()
  })

  it('readStringLiteral returns null for non-string char', () => {
    const src = '42'
    const result = readStringLiteral(src, 0)
    expect(result).toBeNull()
  })

  it('readStringLiteral returns null for unclosed string', () => {
    const src = '"unclosed'
    const result = readStringLiteral(src, 0)
    expect(result).toBeNull()
  })

  it('readStringLiteral returns null for newline in single-line string', () => {
    const src = '"line1\nline2"'
    const result = readStringLiteral(src, 0)
    expect(result).toBeNull()
  })
})

describe('route-module-reader', () => {
  it('detects loader and action exports', () => {
    const src = `
      export function loader() { return {} }
      export function action() { return {} }
      export default function Page() { return null }
    `
    const exports = readRouteModuleExports(src)
    expect(exports?.loader).toBe(true)
    expect(exports?.action).toBe(true)
  })

  it('detects ErrorBoundary export', () => {
    const src = `
      export function ErrorBoundary() { return null }
      export default function Page() { return null }
    `
    const exports = readRouteModuleExports(src)
    expect(exports?.ErrorBoundary).toBe(true)
  })

  it('detects middleware export', () => {
    const src = `
      export const middleware = []
      export default function Page() { return null }
    `
    const exports = readRouteModuleExports(src)
    expect(exports?.middleware).toBe(true)
  })

  it('returns undefined when no route exports', () => {
    const src = `export default function Page() { return null }`
    const exports = readRouteModuleExports(src)
    expect(exports).toBeUndefined()
  })
})

describe('meta-reader', () => {
  it('reads static meta from export', () => {
    const src = `
      export const meta = { title: 'About', auth: true }
      export default function Page() { return null }
    `
    const meta = readStaticMeta(src)
    expect(meta).toEqual({ title: 'About', auth: true })
  })

  it('reads nested meta with arrays and numbers', () => {
    const src = `
      export const meta = { guards: ['auth'], order: 1 }
      export default function Page() { return null }
    `
    const meta = readStaticMeta(src)
    expect(meta).toEqual({ guards: ['auth'], order: 1 })
  })

  it('returns undefined when no meta', () => {
    const src = `export default function Page() { return null }`
    const meta = readStaticMeta(src)
    expect(meta).toBeUndefined()
  })

  it('hasDefaultExport detects default export', () => {
    expect(hasDefaultExport('export default function X() {}')).toBe(true)
    expect(hasDefaultExport('export function X() {}')).toBe(false)
  })

  it('hasDefaultExport detects export default class', () => {
    expect(hasDefaultExport('export default class X {}')).toBe(true)
  })

  it('hasDefaultExport detects export default arrow', () => {
    expect(hasDefaultExport('const X = () => null\nexport default X')).toBe(true)
  })
})

describe('meta-reader advanced values', () => {
  it('reads negative numbers in meta', () => {
    const src = `
      export const meta = { priority: -1 }
      export default function Page() { return null }
    `
    const meta = readStaticMeta(src)
    expect(meta).toEqual({ priority: -1 })
  })

  it('reads null values in meta', () => {
    const src = `
      export const meta = { parent: null }
      export default function Page() { return null }
    `
    const meta = readStaticMeta(src)
    expect(meta).toEqual({ parent: null })
  })

  it('reads template literal strings in meta', () => {
    const src = "export const meta = { title: `About` }\nexport default function Page() { return null }"
    const meta = readStaticMeta(src)
    expect(meta).toEqual({ title: 'About' })
  })

  it('returns undefined for meta with dynamic expressions', () => {
    const src = `
      const prefix = 'App'
      export const meta = { title: prefix + ' - Home' }
      export default function Page() { return null }
    `
    const meta = readStaticMeta(src)
    expect(meta).toBeUndefined()
  })

  it('returns undefined for meta with computed keys', () => {
    const src = `
      const key = 'title'
      export const meta = { [key]: 'Home' }
      export default function Page() { return null }
    `
    const meta = readStaticMeta(src)
    expect(meta).toBeUndefined()
  })

  it('reads boolean values in meta', () => {
    const src = `
      export const meta = { auth: true, public: false }
      export default function Page() { return null }
    `
    const meta = readStaticMeta(src)
    expect(meta).toEqual({ auth: true, public: false })
  })
})

describe('vue-route-block', async () => {
  const { readVueRouteBlockResult, stripVueRouteBlocks, mergeRouteMeta } = await import('../core/vue-route-block')

  it('parses JSON5 route block', () => {
    const src = `<template><div/></template>
<route lang="json5">{ name: "home", path: "/", meta: { auth: true } }</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.block?.name).toBe('home')
    expect(result.block?.meta?.auth).toBe(true)
  })

  it('parses YAML route block', () => {
    const src = `<template><div/></template>
<route lang="yaml">
name: about
path: /about
</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.block?.name).toBe('about')
    expect(result.block?.path).toBe('/about')
  })

  it('parses JSON route block', () => {
    const src = `<template><div/></template>
<route lang="json">{"name": "test", "props": true}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.block?.name).toBe('test')
    expect(result.block?.props).toBe(true)
  })

  it('returns error for unsupported lang', () => {
    const src = `<template><div/></template>
<route lang="toml">name = "test"</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('Unsupported')
  })

  it('returns error for multiple route blocks', () => {
    const src = `<template><div/></template>
<route>{"name": "a"}</route>
<route>{"name": "b"}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('only one')
  })

  it('returns error for route src', () => {
    const src = `<template><div/></template>
<route src="./route.json"></route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('src')
  })

  it('returns error for invalid route fields', () => {
    const src = `<template><div/></template>
<route>{"unknown_field": true}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('Unsupported')
  })

  it('validates meta must be object', () => {
    const src = `<template><div/></template>
<route>{"meta": "string"}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('meta')
  })

  it('validates alias must be string or array', () => {
    const src = `<template><div/></template>
<route>{"alias": 123}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('alias')
  })

  it('validates props must be boolean or object', () => {
    const src = `<template><div/></template>
<route>{"props": "invalid"}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('props')
  })

  it('accepts props as object', () => {
    const src = `<template><div/></template>
<route>{"props": {"id": true}}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.block?.props).toEqual({ id: true })
  })

  it('validates path must be string', () => {
    const src = `<template><div/></template>
<route>{"path": 123}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('path')
  })

  it('validates name must be string', () => {
    const src = `<template><div/></template>
<route>{"name": true}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('name')
  })

  it('accepts alias as string array', () => {
    const src = `<template><div/></template>
<route>{"alias": ["/home", "/main"]}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.block?.alias).toEqual(['/home', '/main'])
  })

  it('rejects alias with non-string items', () => {
    const src = `<template><div/></template>
<route>{"alias": ["ok", 123]}</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('alias')
  })

  it('rejects array as route block', () => {
    const src = `<template><div/></template>
<route>[1, 2, 3]</route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toContain('object')
  })

  it('handles empty route block', () => {
    const src = `<template><div/></template>
<route></route>
<script>export default {}</script>`
    const result = readVueRouteBlockResult(src)
    expect(result.error).toBeUndefined()
    expect(result.block).toBeUndefined()
  })

  it('strips route blocks from SFC', () => {
    const src = `<template><div/></template>
<route>{"name": "test"}</route>
<script>export default {}</script>`
    const result = stripVueRouteBlocks(src)
    expect(result).not.toContain('<route>')
    expect(result).toContain('<template>')
  })

  it('mergeRouteMeta combines export and block meta', () => {
    expect(mergeRouteMeta({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
    expect(mergeRouteMeta(undefined, { b: 2 })).toEqual({ b: 2 })
    expect(mergeRouteMeta(undefined, undefined)).toBeUndefined()
  })
})

describe('route-module-reader edge cases', () => {
  it('detects HydrateFallback and shouldRevalidate', () => {
    const src = `
      export function HydrateFallback() { return null }
      export function shouldRevalidate() { return true }
      export default function Page() { return null }
    `
    const exports = readRouteModuleExports(src)
    expect(exports?.HydrateFallback).toBe(true)
    expect(exports?.shouldRevalidate).toBe(true)
  })

  it('detects handle export', () => {
    const src = `
      export const handle = { breadcrumb: 'Home' }
      export default function Page() { return null }
    `
    const exports = readRouteModuleExports(src)
    expect(exports?.handle).toBe(true)
  })
})
