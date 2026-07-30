import { describe, expect, it } from 'vitest'

import {
  collectRuntimeExports,
  parseModule,
  readSearchParamsFromAst,
  readStaticMetaFromAst,
} from '../core/module-ast'

describe('parseModule', () => {
  it('parses TypeScript source', () => {
    const result = parseModule('const x: number = 1', 'file.ts')
    expect(result.ast).toBeDefined()
    expect(result.source).toBe('const x: number = 1')
  })

  it('parses JSX source', () => {
    const result = parseModule('export default function App() { return <div /> }', 'file.tsx')
    expect(result.ast).toBeDefined()
  })

  it('parses plain JS source (no TS, no JSX)', () => {
    const result = parseModule('export default function App() {}', 'file.js')
    expect(result.ast).toBeDefined()
  })
})

describe('collectRuntimeExports', () => {
  it('collects default export', () => {
    const parsed = parseModule('export default function App() {}', 'file.tsx')
    const exports = collectRuntimeExports(parsed)
    expect(exports.has('default')).toBe(true)
  })

  it('collects named function exports', () => {
    const parsed = parseModule('export function loader() {}', 'file.tsx')
    const exports = collectRuntimeExports(parsed)
    expect(exports.has('loader')).toBe(true)
  })

  it('collects named const exports', () => {
    const parsed = parseModule('export const meta = { title: "hi" }', 'file.tsx')
    const exports = collectRuntimeExports(parsed)
    expect(exports.has('meta')).toBe(true)
  })

  it('ignores type-only exports', () => {
    const parsed = parseModule('export type MyType = string', 'file.ts')
    const exports = collectRuntimeExports(parsed)
    expect(exports.has('MyType')).toBe(false)
  })

  it('ignores TS-only default declarations (type aliases)', () => {
    const parsed = parseModule('export default interface Foo {}', 'file.ts')
    const exports = collectRuntimeExports(parsed)
    expect(exports.has('default')).toBe(false)
  })

  it('collects re-exported specifiers', () => {
    const parsed = parseModule('const foo = 1; export { foo }', 'file.ts')
    const exports = collectRuntimeExports(parsed)
    expect(exports.has('foo')).toBe(true)
  })

  it('collects re-exported specifiers with alias', () => {
    const parsed = parseModule('const foo = 1; export { foo as bar }', 'file.ts')
    const exports = collectRuntimeExports(parsed)
    expect(exports.has('bar')).toBe(true)
  })

  it('ignores type re-exports in specifiers', () => {
    const parsed = parseModule('type T = number; export { type T }', 'file.ts')
    const exports = collectRuntimeExports(parsed)
    expect(exports.has('T')).toBe(false)
  })

  it('handles empty module', () => {
    const parsed = parseModule('const x = 1', 'file.ts')
    const exports = collectRuntimeExports(parsed)
    expect(exports.size).toBe(0)
  })
})

describe('readStaticMetaFromAst', () => {
  it('reads simple meta object', () => {
    const parsed = parseModule(`export const meta = { title: 'Home' }`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toEqual({ title: 'Home' })
  })

  it('handles meta with as expression', () => {
    const parsed = parseModule(`export const meta = { title: 'Home' } as const`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toEqual({ title: 'Home' })
  })

  it('handles meta with satisfies expression', () => {
    const parsed = parseModule(`
      type Meta = { title: string }
      export const meta = { title: 'Home' } satisfies Meta
    `, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toEqual({ title: 'Home' })
  })

  it('handles meta wrapped in function call', () => {
    const parsed = parseModule(`export const meta = defineMeta({ title: 'Page' })`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toEqual({ title: 'Page' })
  })

  it('handles numeric and boolean values', () => {
    const parsed = parseModule(`export const meta = { priority: 1, hidden: true }`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toEqual({ priority: 1, hidden: true })
  })

  it('handles null values', () => {
    const parsed = parseModule(`export const meta = { redirect: null }`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toEqual({ redirect: null })
  })

  it('handles negative numbers', () => {
    const parsed = parseModule(`export const meta = { order: -1 }`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toEqual({ order: -1 })
  })

  it('handles template literals without expressions', () => {
    const parsed = parseModule('export const meta = { title: `Home` }', 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toEqual({ title: 'Home' })
  })

  it('handles arrays in meta', () => {
    const parsed = parseModule(`export const meta = { guards: ['auth', 'admin'] }`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toEqual({ guards: ['auth', 'admin'] })
  })

  it('returns undefined for non-meta exports', () => {
    const parsed = parseModule(`export const loader = () => {}`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toBeUndefined()
  })

  it('returns undefined when meta is not an object', () => {
    const parsed = parseModule(`export const meta = 'string'`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toBeUndefined()
  })

  it('returns undefined for dynamic expressions in meta', () => {
    const parsed = parseModule(`export const meta = { title: getTitle() }`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toBeUndefined()
  })

  it('returns undefined for computed properties', () => {
    const parsed = parseModule(`const key = 'title'; export const meta = { [key]: 'val' }`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toBeUndefined()
  })

  it('returns undefined for spread elements in arrays', () => {
    const parsed = parseModule(`export const meta = { items: [...arr] }`, 'file.tsx')
    expect(readStaticMetaFromAst(parsed)).toBeUndefined()
  })
})

describe('readSearchParamsFromAst', () => {
  it('reads searchParams record', () => {
    const parsed = parseModule(
      `export const searchParams = { q: 'string', page: 'number' }`,
      'file.tsx',
    )
    expect(readSearchParamsFromAst(parsed)).toEqual({ q: 'string', page: 'number' })
  })

  it('returns undefined for non-searchParams exports', () => {
    const parsed = parseModule(`export const other = { a: 'b' }`, 'file.tsx')
    expect(readSearchParamsFromAst(parsed)).toBeUndefined()
  })

  it('returns undefined when no valid string values', () => {
    const parsed = parseModule(
      `export const searchParams = { key: 123 }`,
      'file.tsx',
    )
    expect(readSearchParamsFromAst(parsed)).toBeUndefined()
  })

  it('filters out non-string values', () => {
    const parsed = parseModule(
      `export const searchParams = { q: 'string', invalid: 42, flag: 'boolean' }`,
      'file.tsx',
    )
    expect(readSearchParamsFromAst(parsed)).toEqual({ q: 'string', flag: 'boolean' })
  })
})
