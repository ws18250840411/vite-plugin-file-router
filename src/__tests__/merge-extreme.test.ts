import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { mergeRouteFiles } from '../emit/merge-routes'
import { resolveOptions, runGeneration } from '../generate'

function freshReactRoutes(extraPages: Record<string, string> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-extreme-'))
  const pagesDir = path.join(root, 'src', 'pages')
  fs.mkdirSync(pagesDir, { recursive: true })
  fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default function H() { return null }')
  fs.writeFileSync(path.join(pagesDir, 'about.tsx'), 'export default function A() { return null }')
  for (const [rel, src] of Object.entries(extraPages)) {
    const f = path.join(pagesDir, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, src)
  }
  const resolved = resolveOptions(root, { framework: 'react' })
  return { root, resolved, outFile: resolved.outFile }
}

/** Trigger regeneration by adding a new page (forces signature mismatch). */
function touchNewPage(resolved: ReturnType<typeof resolveOptions>) {
  const name = `probe_${Date.now()}.tsx`
  fs.writeFileSync(
    path.join(resolved.pagesDir, name),
    'export default function P() { return null }',
  )
}

describe('extreme manual edits', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function track<T extends { root: string }>(r: T): T {
    dirs.push(r.root)
    return r
  }

  // ─── File-level destruction (must add page to bypass signature cache) ─────

  it('empty file + page change: refuses to overwrite, preserves byte-for-byte', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    fs.writeFileSync(outFile, '')
    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow()
    expect(fs.readFileSync(outFile, 'utf-8')).toBe('')
  })

  it('whitespace-only file + page change: refuses to overwrite', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    fs.writeFileSync(outFile, '   \n\n  \n')
    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow()
    expect(fs.readFileSync(outFile, 'utf-8')).toBe('   \n\n  \n')
  })

  it('truncated mid-route + page change: refuses to overwrite', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    const content = fs.readFileSync(outFile, 'utf-8')
    const cut = content.indexOf('lazy: async')
    const truncated = content.slice(0, cut + 20)
    fs.writeFileSync(outFile, truncated)
    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow()
    expect(fs.readFileSync(outFile, 'utf-8')).toBe(truncated)
  })

  it('renamed routes variable + page change: refuses to overwrite', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    const content = fs.readFileSync(outFile, 'utf-8')
    fs.writeFileSync(outFile, content.replace('export const routes', 'export const myRoutes'))
    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow()
    expect(fs.readFileSync(outFile, 'utf-8')).toContain('myRoutes')
  })

  it('routes wrapped in function call + page change: refuses to overwrite', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    const content = fs.readFileSync(outFile, 'utf-8')
    const modified = content
      .replace('export const routes = [', 'export const routes = wrap([')
      .replace('] satisfies RouteObject[]', ']) satisfies RouteObject[]')
    fs.writeFileSync(outFile, modified)
    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow()
    expect(fs.readFileSync(outFile, 'utf-8')).toContain('wrap(')
  })

  // ─── Manifest corruption ─────────────────────────────────────────────────

  it('deleted manifest: falls back to no-baseline merge, preserves user edits', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')
    // Remove manifest
    content = content.replace(/\n\/\* @vite-file-router-manifest .* \*\/\s*$/, '').trimEnd() + '\n'
    // Add user edit (replace the full path line to avoid double comma)
    content = content.replace(
      'path: "/about",',
      'path: "/about",\n        handle: { custom: true },'
    )
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    runGeneration(resolved, () => {}, () => {})

    const after = fs.readFileSync(outFile, 'utf-8')
    expect(after).toContain('custom: true')
    expect(after).toContain('probe_')
    expect(after).toContain('@vite-file-router-manifest')
  })

  it('corrupted manifest (invalid base64): falls back gracefully', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')
    content = content.replace(
      /\/\* @vite-file-router-manifest [A-Za-z0-9+/=]+ \*\//,
      '/* @vite-file-router-manifest !!!invalid!!! */'
    )
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).not.toThrow()
    const after = fs.readFileSync(outFile, 'utf-8')
    expect(after).toContain('probe_')
    expect(after).toContain('@vite-file-router-manifest')
  })

  it('future manifest version: falls back gracefully', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')
    const futureManifest = Buffer.from(
      JSON.stringify({ version: 99, routes: {}, imports: [], statements: [] })
    ).toString('base64')
    content = content.replace(
      /\/\* @vite-file-router-manifest [A-Za-z0-9+/=]+ \*\//,
      `/* @vite-file-router-manifest ${futureManifest} */`
    )
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).not.toThrow()
    expect(fs.readFileSync(outFile, 'utf-8')).toContain('probe_')
  })

  // ─── Route-level extreme edits ───────────────────────────────────────────

  it('user deletes a route but page file still exists: deletion is preserved', async () => {
    const { collectPositionedRouteSlices } = await import('../emit/parse-routes-file')
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})

    let content = fs.readFileSync(outFile, 'utf-8')
    // Use positioned slices for precise start/end offsets
    const slices = collectPositionedRouteSlices(content)
    const about = slices.find(s => s.routeId === "page:about.tsx")
    expect(about).toBeTruthy()
    // Find the @file-route marker comment preceding this route
    const markerStart = content.lastIndexOf('/* @file-route', about!.start)
    // Find the comma after the route object
    let end = about!.end
    while (end < content.length && content[end] !== ',') end++
    end++ // consume the comma
    // Remove marker + route + comma
    content = content.slice(0, markerStart) + content.slice(end)
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    runGeneration(resolved, () => {}, () => {})

    const after = fs.readFileSync(outFile, 'utf-8')
    expect(after).not.toContain('page:about.tsx')
  })

  it('user adds duplicate @file-route marker: write is rejected', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')
    content = content.replace(
      '/* @file-route "page:about.tsx" */',
      '/* @file-route "page:index.tsx" */'
    )
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow()
  })

  it('user adds a custom route (no marker): preserved through regen', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')
    const customRoute = `  {
    path: "/custom",
    element: null,
  },`
    content = content.replace('] satisfies RouteObject[]', `${customRoute}\n] satisfies RouteObject[]`)
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    runGeneration(resolved, () => {}, () => {})

    const after = fs.readFileSync(outFile, 'utf-8')
    expect(after).toContain('/custom')
    expect(after).toContain('probe_')
  })

  it('user adds a custom import: preserved through regen', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')
    const customImport = "import { authGuard } from './guards'"
    content = content.replace(
      'import type { RouteObject }',
      `${customImport}\nimport type { RouteObject }`
    )
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    runGeneration(resolved, () => {}, () => {})

    const after = fs.readFileSync(outFile, 'utf-8')
    expect(after).toContain('authGuard')
    expect(after).toContain('probe_')
  })

  it('user changes satisfies type: fresh codegen restores correct type', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')
    content = content.replace('satisfies RouteObject[]', 'satisfies unknown')
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).not.toThrow()
    const after = fs.readFileSync(outFile, 'utf-8')
    expect(after).toContain('satisfies RouteObject[]')
  })

  it('user adds spread element in route: preserved as custom property', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')
    content = content.replace(
      'path: "/about",',
      'path: "/about",\n        ...authMeta,'
    )
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).not.toThrow()
    const after = fs.readFileSync(outFile, 'utf-8')
    expect(after).toContain('...authMeta')
  })

  it('user adds non-ASCII meta: handled correctly', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')
    content = content.replace(
      'path: "/about",',
      'path: "/about",\n        handle: { title: "关于", emoji: "🌐" },'
    )
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    expect(() => runGeneration(resolved, () => {}, () => {})).not.toThrow()
    const after = fs.readFileSync(outFile, 'utf-8')
    expect(after).toContain('关于')
    expect(after).toContain('🌐')
  })

  // ─── Multiple simultaneous extreme edits ─────────────────────────────────

  it('multiple extreme edits at once: all preserved or safely rejected', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    let content = fs.readFileSync(outFile, 'utf-8')

    // 1. Add custom import
    content = content.replace(
      'import type { RouteObject }',
      "import { guard } from './guard'\nimport type { RouteObject }"
    )
    // 2. Add handle to about route (user edit)
    content = content.replace(
      'path: "/about",',
      'path: "/about",\n        handle: { auth: true },'
    )
    // 3. Add a custom route (no marker)
    content = content.replace(
      '] satisfies RouteObject[]',
      '  {\n    path: "/admin",\n    lazy: async () => { const m = await import("./pages/admin.tsx"); return { Component: m.default } },\n  },\n] satisfies RouteObject[]'
    )
    fs.writeFileSync(outFile, content)

    touchNewPage(resolved)
    runGeneration(resolved, () => {}, () => {})

    const after = fs.readFileSync(outFile, 'utf-8')
    expect(after).toContain('guard')           // custom import preserved
    expect(after).toContain('auth: true')      // user edit preserved
    expect(after).toContain('/admin')          // custom route preserved
    expect(after).toContain('probe_')          // new generated route added
    expect(after).toContain('@vite-file-router-manifest') // manifest regenerated
  })

  // ─── Signature cache: corruption without page change is NOT detected ─────
  // This is a known design trade-off: the signature optimization skips
  // regeneration when no pages changed. Corrupted files are detected on
  // the next page change or server restart.

  it('corrupted file without page change: signature cache skips regen (known trade-off)', () => {
    const { resolved, outFile } = track(freshReactRoutes())
    runGeneration(resolved, () => {}, () => {})
    const original = fs.readFileSync(outFile, 'utf-8')

    // Corrupt the file
    fs.writeFileSync(outFile, 'CORRUPTED')
    // Regen WITHOUT page change - signature matches, so regen is skipped
    const { changed } = runGeneration(resolved, () => {}, () => {})
    expect(changed).toBe(false)
    // File is still corrupted (regen was skipped)
    expect(fs.readFileSync(outFile, 'utf-8')).toBe('CORRUPTED')
    // But original is recoverable: touch a page and regen throws (refuses to overwrite)
    // then delete the corrupted file and regen produces fresh output
    fs.unlinkSync(outFile)
    const { changed: changed2 } = runGeneration(resolved, () => {}, () => {})
    expect(changed2).toBe(true)
    expect(fs.readFileSync(outFile, 'utf-8')).toContain('export const routes')
  })
})
