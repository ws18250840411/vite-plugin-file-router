/** Normalize import path for stable RouteId comparison. */
export function normalizeRouteId(importPath: string): string {
  return importPath.replace(/\\/g, '/')
}

export function isPagesImport(importPath: string): boolean {
  const p = normalizeRouteId(importPath)
  return p.includes('/pages/') || p.startsWith('./pages') || p.startsWith('../pages')
}

const AUXILIARY_PAGE_IMPORT = /\/(loading|error)(?:\.[^/]+)?$/

function pickPrimaryPagesImport(paths: string[]): string | undefined {
  const pageImports = paths.filter(isPagesImport)
  return pageImports.find((p) => !AUXILIARY_PAGE_IMPORT.test(p)) ?? pageImports[0]
}

/** Extract dynamic `import("...")` paths from a route object slice. */
export function extractImportPathsFromRouteObject(text: string): string[] {
  const paths: string[] = []
  const re = /import\s*\(\s*(['"])(.*?)\1\s*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    paths.push(normalizeRouteId(match[2]))
  }
  return paths
}

function resolveSyncBinding(fileContent: string, binding: string): string | null {
  const patterns = [
    new RegExp(`import\\s+${binding}\\s+from\\s+(['"])(.+?)\\1`),
    new RegExp(
      `import\\s*\\{\\s*default\\s+as\\s+${binding}(?:\\s*,\\s*[\\w$]+)*\\s*\\}\\s+from\\s+(['"])(.+?)\\2`,
    ),
  ]
  for (const re of patterns) {
    const m = fileContent.match(re)
    if (m) {
      const importPath = m[m.length - 1]
      if (isPagesImport(importPath)) return normalizeRouteId(importPath)
    }
  }
  return null
}

/** Primary RouteId for a route object — page/layout import path. */
export function primaryRouteId(routeText: string, fileContent: string): string | null {
  const dynamic = pickPrimaryPagesImport(extractImportPathsFromRouteObject(routeText))
  if (dynamic) return dynamic

  const reactSync = routeText.match(/\bComponent:\s*([A-Za-z_$][\w$]*)/)
  if (reactSync) {
    const resolved = resolveSyncBinding(fileContent, reactSync[1])
    if (resolved) return resolved
  }

  const vueSync = routeText.match(/\bcomponent:\s*([A-Za-z_$][\w$]*)\s*,/)
  if (vueSync) {
    const resolved = resolveSyncBinding(fileContent, vueSync[1])
    if (resolved) return resolved
  }

  const importBindings = fileContent.matchAll(
    /import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2/g,
  )
  for (const match of importBindings) {
    const importPath = match[3]
    if (!isPagesImport(importPath)) continue
    const bindings = match[1].split(',').map((part) => part.trim())
    for (const binding of bindings) {
      const defaultAs = binding.match(/^default\s+as\s+([A-Za-z_$][\w$]*)$/)?.[1]
      const name = defaultAs ?? (/^[A-Za-z_$][\w$]*$/.test(binding) ? binding : null)
      if (!name) continue
      const pattern = new RegExp(`\\b${name}\\b`)
      if (pattern.test(routeText)) return normalizeRouteId(importPath)
    }
  }

  return null
}

export function extractPrelude(content: string): string {
  const marker = 'export const routes'
  const idx = content.indexOf(marker)
  if (idx < 0) return ''
  return content.slice(0, idx)
}

export function extractRoutesArraySection(content: string): {
  prefix: string
  body: string
  suffix: string
} | null {
  const marker = 'export const routes'
  const startIdx = content.indexOf(marker)
  if (startIdx < 0) return null

  const eqIdx = content.indexOf('=', startIdx)
  if (eqIdx < 0) return null

  const openBracket = content.indexOf('[', eqIdx)
  if (openBracket < 0) return null

  let depth = 1
  let i = openBracket + 1
  while (i < content.length && depth > 0) {
    const ch = content[i]
    if (ch === '[') depth++
    else if (ch === ']') depth--
    i++
  }
  if (depth !== 0) return null

  const closeBracket = i - 1
  return {
    prefix: content.slice(0, openBracket + 1),
    body: content.slice(openBracket + 1, closeBracket),
    suffix: content.slice(closeBracket),
  }
}

/** Split an array body into top-level `{ ... }` route object slices. */
export function splitTopLevelRouteObjects(body: string): string[] {
  return splitTopLevelRouteObjectsWithOffsets(body, 0).map((entry) => entry.text.trim())
}

export interface RouteObjectOffset {
  text: string
  start: number
  end: number
}

export function splitTopLevelRouteObjectsWithOffsets(
  body: string,
  offsetBase: number,
): RouteObjectOffset[] {
  const objects: RouteObjectOffset[] = []
  let depth = 0
  let start = -1

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        objects.push({
          text: body.slice(start, i + 1),
          start: offsetBase + start,
          end: offsetBase + i + 1,
        })
        start = -1
      }
    }
  }

  return objects
}

export interface PositionedRouteSlice {
  id: string | null
  start: number
  end: number
  text: string
  hasChildren: boolean
}

export function collectPositionedRouteSlices(content: string): PositionedRouteSlice[] {
  const section = extractRoutesArraySection(content)
  if (!section) return []

  const bodyStart = section.prefix.length
  const slices: PositionedRouteSlice[] = []

  const visitRegion = (regionBody: string, regionStart: number) => {
    for (const obj of splitTopLevelRouteObjectsWithOffsets(regionBody, regionStart)) {
      const id = primaryRouteId(obj.text, content)
      const children = extractChildrenSlice(obj.text)
      slices.push({
        id,
        start: obj.start,
        end: obj.end,
        text: obj.text,
        hasChildren: children !== null,
      })

      if (!children) continue

      const marker = /\bchildren:\s*\[/.exec(obj.text)
      if (!marker || marker.index === undefined) continue

      const relArrayStart = marker.index + marker[0].length
      let depth = 1
      let j = relArrayStart
      while (j < obj.text.length && depth > 0) {
        const ch = obj.text[j]
        if (ch === '[') depth++
        else if (ch === ']') depth--
        j++
      }
      if (depth !== 0) continue

      visitRegion(obj.text.slice(relArrayStart, j - 1), obj.start + relArrayStart)
    }
  }

  visitRegion(section.body, bodyStart)
  return slices
}

export interface RouteChildrenSlice {
  head: string
  children: string[]
  close: string
}

export function extractChildrenSlice(routeText: string): RouteChildrenSlice | null {
  const match = /\bchildren:\s*\[/.exec(routeText)
  if (!match || match.index === undefined) return null

  const head = routeText.slice(0, match.index).trimEnd()
  const arrayStart = match.index + match[0].length

  let depth = 1
  let i = arrayStart
  while (i < routeText.length && depth > 0) {
    const ch = routeText[i]
    if (ch === '[') depth++
    else if (ch === ']') depth--
    i++
  }
  if (depth !== 0) return null

  const childrenBody = routeText.slice(arrayStart, i - 1)
  const tail = routeText.slice(i).trim()
  const close = tail.replace(/^,\s*/, '')

  return {
    head,
    children: splitTopLevelRouteObjects(childrenBody),
    close,
  }
}

export function collectRouteSliceMap(content: string): Map<string, string> {
  const map = new Map<string, string>()
  const section = extractRoutesArraySection(content)
  if (!section) return map

  const visit = (objects: string[]) => {
    for (const obj of objects) {
      const id = primaryRouteId(obj, content)
      if (id) map.set(id, obj)
      const children = extractChildrenSlice(obj)
      if (children) visit(children.children)
    }
  }

  visit(splitTopLevelRouteObjects(section.body))
  return map
}

export function extractImportLines(prelude: string): string[] {
  return prelude
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('import '))
}
