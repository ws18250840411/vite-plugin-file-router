import { describe, expect, it } from 'vitest'

import {
  collectRouteSliceMap,
  extractChildrenSlice,
  extractImportLines,
  extractImportPathsFromRouteObject,
  extractPrelude,
  extractRoutesArraySection,
  parseRoutesFile,
  primaryRouteId,
  splitTopLevelRouteObjects,
  splitTopLevelRouteObjectsWithOffsets,
} from '../emit/parse-routes-file'

describe('parse-routes-file utilities', () => {
  describe('extractChildrenSlice', () => {
    it('extracts children from a route object', () => {
      const routeText = `{
  path: "/dashboard",
  children: [
    { path: "/dashboard/stats" },
    { path: "/dashboard/users" },
  ],
}`
      const result = extractChildrenSlice(routeText)
      expect(result).not.toBeNull()
      expect(result!.children).toHaveLength(2)
      expect(result!.children[0]).toContain('stats')
      expect(result!.children[1]).toContain('users')
    })

    it('returns null for route without children', () => {
      const routeText = `{ path: "/about", element: "About" }`
      const result = extractChildrenSlice(routeText)
      expect(result).toBeNull()
    })

    it('returns null for invalid input', () => {
      const result = extractChildrenSlice('not valid js }{][')
      expect(result).toBeNull()
    })
  })

  describe('collectRouteSliceMap', () => {
    it('maps route ids to their text', () => {
      const content = `/* eslint-disable */
export const routes = [
  /* @file-route "page:index" */ { path: "/" },
  /* @file-route "page:about" */ { path: "/about" },
]
`
      const map = collectRouteSliceMap(content)
      expect(map.size).toBeGreaterThan(0)
      expect(map.has('page:index')).toBe(true)
    })

    it('returns empty map for unparseable content', () => {
      const map = collectRouteSliceMap('invalid content {{{')
      expect(map.size).toBe(0)
    })
  })

  describe('extractImportLines', () => {
    it('extracts import declarations', () => {
      const prelude = `import React from 'react'
import { Outlet } from 'react-router-dom'
const x = 1
`
      const lines = extractImportLines(prelude)
      expect(lines).toHaveLength(2)
      expect(lines[0]).toContain("import React from 'react'")
      expect(lines[1]).toContain('react-router-dom')
    })

    it('returns empty array for invalid syntax', () => {
      const lines = extractImportLines('import { unclosed from')
      expect(lines).toEqual([])
    })

    it('returns empty array for no imports', () => {
      const lines = extractImportLines('const x = 1\nconst y = 2')
      expect(lines).toEqual([])
    })
  })

  describe('parseRoutesFile', () => {
    it('parses a valid routes file', () => {
      const content = `/* eslint-disable */
export const routes = [
  /* @file-route "page:index" */ { path: "/" },
]
`
      const result = parseRoutesFile(content)
      expect(result).not.toBeNull()
      expect(result!.routes).toHaveLength(1)
    })

    it('returns null for files without route export', () => {
      const content = `const x = 42`
      const result = parseRoutesFile(content)
      expect(result).toBeNull()
    })

    it('handles nested route structures', () => {
      const content = `/* eslint-disable */
export const routes = [
  /* @file-route "layout:dashboard" */ {
    path: "/dashboard",
    children: [
      /* @file-route "page:dashboard/index" */ { path: "/" },
    ],
  },
]
`
      const result = parseRoutesFile(content)
      expect(result).not.toBeNull()
      expect(result!.routes[0].children).toHaveLength(1)
    })
  })

  describe('extractImportPathsFromRouteObject', () => {
    it('extracts dynamic import paths from a route object', () => {
      const text = `{ path: "/about", lazy: () => import("./pages/about.tsx") }`
      const paths = extractImportPathsFromRouteObject(text)
      expect(paths).toContain('./pages/about.tsx')
    })

    it('returns empty array for route without dynamic imports', () => {
      const text = `{ path: "/about", Component: AboutPage }`
      const paths = extractImportPathsFromRouteObject(text)
      expect(paths).toEqual([])
    })

    it('returns empty array for invalid syntax', () => {
      const paths = extractImportPathsFromRouteObject('not valid {{{')
      expect(paths).toEqual([])
    })
  })

  describe('primaryRouteId', () => {
    it('returns marker id when @file-route comment exists', () => {
      const routeText = `/* @file-route "page:about" */ { path: "/about" }`
      const result = primaryRouteId(routeText, 'export const routes = []')
      expect(result).toBe('page:about')
    })

    it('returns dynamic import path as route id', () => {
      const routeText = `{ path: "/about", lazy: () => import("./pages/about.tsx") }`
      const result = primaryRouteId(routeText, 'export const routes = []')
      expect(result).toBe('./pages/about.tsx')
    })

    it('resolves static import binding as route id', () => {
      const fileContent = `import AboutPage from './pages/about.tsx'\nexport const routes = [{ path: "/about", Component: AboutPage }]`
      const routeText = `{ path: "/about", Component: AboutPage }`
      const result = primaryRouteId(routeText, fileContent)
      expect(result).toBe('./pages/about.tsx')
    })

    it('returns null for unresolvable route', () => {
      const routeText = `{ path: "/about" }`
      const result = primaryRouteId(routeText, 'export const routes = []')
      expect(result).toBeNull()
    })

    it('returns null for invalid syntax', () => {
      const result = primaryRouteId('{{{invalid', '{{{also invalid')
      expect(result).toBeNull()
    })
  })

  describe('extractPrelude', () => {
    it('returns content before routes declaration', () => {
      const content = `import React from 'react'\n\nexport const routes = [\n  { path: "/" },\n]\n`
      const prelude = extractPrelude(content)
      expect(prelude).toContain("import React from 'react'")
      expect(prelude).not.toContain('export const routes')
    })

    it('returns empty string for unparseable content', () => {
      const prelude = extractPrelude('not a valid routes file')
      expect(prelude).toBe('')
    })
  })

  describe('extractRoutesArraySection', () => {
    it('splits content into prefix/body/suffix', () => {
      const content = `import X from 'x'\nexport const routes = [\n  { path: "/" },\n]\nexport default routes\n`
      const result = extractRoutesArraySection(content)
      expect(result).not.toBeNull()
      expect(result!.prefix).toContain('export const routes = [')
      expect(result!.body).toContain('path: "/"')
      expect(result!.suffix).toContain(']')
    })

    it('returns null for non-routes content', () => {
      const result = extractRoutesArraySection('const x = 42')
      expect(result).toBeNull()
    })
  })

  describe('splitTopLevelRouteObjects', () => {
    it('splits route array body into individual objects', () => {
      const body = `\n  { path: "/" },\n  { path: "/about" },\n`
      const objects = splitTopLevelRouteObjects(body)
      expect(objects).toHaveLength(2)
      expect(objects[0]).toContain('path: "/"')
      expect(objects[1]).toContain('path: "/about"')
    })

    it('returns empty array for invalid syntax', () => {
      const objects = splitTopLevelRouteObjects('{{{invalid')
      expect(objects).toEqual([])
    })

    it('handles empty body', () => {
      const objects = splitTopLevelRouteObjects('')
      expect(objects).toEqual([])
    })
  })

  describe('splitTopLevelRouteObjectsWithOffsets', () => {
    it('returns objects with correct offsets', () => {
      const body = `\n  { path: "/" },\n  { path: "/about" },\n`
      const results = splitTopLevelRouteObjectsWithOffsets(body, 100)
      expect(results).toHaveLength(2)
      expect(results[0].text).toContain('path: "/"')
      expect(results[0].start).toBeGreaterThanOrEqual(100)
      expect(results[1].start).toBeGreaterThan(results[0].end)
    })

    it('returns empty array for invalid input', () => {
      const results = splitTopLevelRouteObjectsWithOffsets('{{{', 0)
      expect(results).toEqual([])
    })
  })
})
