import {
  collectPositionedRouteSlices,
  collectRouteSliceMap,
  extractChildrenSlice,
  extractImportLines,
  extractPrelude,
  extractRoutesArraySection,
  primaryRouteId,
} from './parse-routes-file'

function indentOfFirstLine(text: string): string {
  const line = text.split('\n')[0] ?? ''
  return line.match(/^(\s*)/)?.[1] ?? ''
}

function reindentRouteBlock(text: string, targetIndent: string): string {
  const lines = text.split('\n')
  if (lines.length === 0) return text

  const sourceIndent = indentOfFirstLine(text)
  return lines
    .map((line, index) => {
      if (line.trim() === '') return ''
      if (index === 0) return targetIndent + line.trimStart()
      const stripped = line.startsWith(sourceIndent)
        ? line.slice(sourceIndent.length)
        : line.trimStart()
      return targetIndent + stripped
    })
    .join('\n')
}

function mergeImportPrelude(freshContent: string, oldContent: string, mergedRoutes: string): string {
  const freshPrelude = extractPrelude(freshContent)
  const oldPrelude = extractPrelude(oldContent)
  const oldImports = extractImportLines(oldPrelude)
  const freshImportText = freshPrelude

  const extraImports: string[] = []
  for (const line of oldImports) {
    if (freshImportText.includes(line)) continue

    const defaultImport = line.match(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+['"](.+?)['"]/)
    if (defaultImport && mergedRoutes.includes(defaultImport[1])) {
      extraImports.push(line)
      continue
    }

    const namedDefault = line.match(
      /^import\s*\{\s*default\s+as\s+([A-Za-z_$][\w$]*)/,
    )
    if (namedDefault && mergedRoutes.includes(namedDefault[1])) {
      extraImports.push(line)
    }
  }

  if (extraImports.length === 0) return freshPrelude

  const lines = freshPrelude.split('\n')
  const insertAt = lines.findIndex((line) => line.trim().startsWith('export type'))
  const importBlock = extraImports.join('\n')
  if (insertAt < 0) return `${freshPrelude.trimEnd()}\n${importBlock}\n`
  return [...lines.slice(0, insertAt), importBlock, '', ...lines.slice(insertAt)].join('\n')
}

function sliceText(slice: string): string {
  return slice.replace(/\s+/g, ' ').trim()
}

/** Route-object fields driven by pages/loading.* and pages/error.* — always follow fresh scan. */
const CODEGEN_ROUTE_FIELDS = ['HydrateFallback', 'ErrorBoundary'] as const

function routeEntryHead(slice: string): { head: string; rest: string } {
  const match = slice.match(/\n(\s+)(lazy|Component):/)
  if (!match || match.index === undefined) {
    return { head: slice, rest: '' }
  }
  return {
    head: slice.slice(0, match.index),
    rest: slice.slice(match.index),
  }
}

function stripRouteLevelFields(head: string, fields: readonly string[]): string {
  let result = head
  for (const field of fields) {
    result = result.replace(new RegExp(`\\n?[ \\t]*\\b${field}:\\s*[^,\\n]+,?`, 'g'), '')
  }
  return result
}

function extractRouteLevelFields(head: string, fields: readonly string[]): string[] {
  const lines: string[] = []
  for (const field of fields) {
    const re = new RegExp(`\\n?[ \\t]*\\b(${field}:\\s*[^,\\n]+,?)`)
    const m = head.match(re)
    if (m) lines.push(m[1].trimEnd())
  }
  return lines
}

function syncCodegenRouteFields(patchedSlice: string, freshSlice: string): string {
  const { head: patchedHead, rest } = routeEntryHead(patchedSlice)
  const { head: freshHead } = routeEntryHead(freshSlice)

  const strippedHead = stripRouteLevelFields(patchedHead, CODEGEN_ROUTE_FIELDS)
  const freshFields = extractRouteLevelFields(freshHead, CODEGEN_ROUTE_FIELDS)

  if (freshFields.length === 0) {
    return strippedHead + rest
  }

  const lineIndent = indentOfFirstLine(patchedSlice) + '  '
  const fieldBlock = freshFields.map((f) => `${lineIndent}${f}`).join('\n')
  return `${strippedHead.trimEnd()}\n${fieldBlock}${rest}`
}

function hasLocalRouteEdits(freshContent: string, oldContent: string): boolean {
  const freshMap = collectRouteSliceMap(freshContent)
  const oldMap = collectRouteSliceMap(oldContent)

  const freshIds = [...freshMap.keys()].sort()
  const oldIds = [...oldMap.keys()].sort()
  if (freshIds.join('\0') !== oldIds.join('\0')) return true

  return freshIds.some((id) => sliceText(oldMap.get(id) ?? '') !== sliceText(freshMap.get(id) ?? ''))
}

function patchRouteSlices(
  content: string,
  oldMap: Map<string, string>,
  oldFileContent: string,
): string {
  const slices = collectPositionedRouteSlices(content)
  let result = content

  for (const slice of [...slices].sort((a, b) => b.start - a.start)) {
    const oldSlice = slice.id ? oldMap.get(slice.id) : undefined
    if (!oldSlice) continue

    if (slice.hasChildren) {
      const currentSliceText = result.slice(slice.start, slice.end)
      const freshChildren = extractChildrenSlice(slice.text)
      const oldChildren = extractChildrenSlice(oldSlice)
      if (!freshChildren || !oldChildren) continue
      if (sliceText(freshChildren.head) === sliceText(oldChildren.head)) continue

      const childrenMarker = /\bchildren:\s*\[/.exec(currentSliceText)
      if (!childrenMarker || childrenMarker.index === undefined) continue

      const freshHeadInSlice = currentSliceText.slice(0, childrenMarker.index).trimEnd()
      const newHead = syncCodegenRouteFields(
        reindentRouteBlock(oldChildren.head, indentOfFirstLine(freshHeadInSlice)),
        freshChildren.head,
      )
      const newText = `${newHead}\n${currentSliceText.slice(childrenMarker.index)}`
      result = result.slice(0, slice.start) + newText + result.slice(slice.end)
      continue
    }

    if (sliceText(oldSlice) === sliceText(slice.text)) continue
    const patched = syncCodegenRouteFields(
      reindentRouteBlock(oldSlice, indentOfFirstLine(slice.text)),
      slice.text,
    )
    result = result.slice(0, slice.start) + patched + result.slice(slice.end)
  }

  return result
}

/**
 * Merge freshly generated routes with an existing routes file.
 * Patches fresh output in place so formatting stays stable; leaf routes keep local edits.
 *
 * Orphan routes (no pages/ import) in the old file are not preserved — output follows fresh scan only.
 */
export function mergeRouteFiles(freshContent: string, oldContent: string): string {
  if (freshContent === oldContent) return oldContent

  const freshSection = extractRoutesArraySection(freshContent)
  const oldSection = extractRoutesArraySection(oldContent)
  if (!freshSection) return freshContent
  if (!oldSection) return freshContent

  const oldMap = collectRouteSliceMap(oldContent)
  if (oldMap.size === 0) return freshContent
  if (!hasLocalRouteEdits(freshContent, oldContent)) return freshContent

  let result = patchRouteSlices(freshContent, oldMap, oldContent)

  const prelude = mergeImportPrelude(freshContent, oldContent, result)
  const freshPrelude = extractPrelude(freshContent)
  if (prelude !== freshPrelude) {
    result = `${prelude}${result.slice(freshPrelude.length)}`
  }

  return result
}
