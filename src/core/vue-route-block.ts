import type { RouteMeta } from '../types'
import { parse as parseSfc } from '@vue/compiler-sfc'
import JSON5 from 'json5'
import { parse as parseYaml } from 'yaml'

/**
 * Parsed `<route>` custom block from Vue SFC files.
 * @see https://uvr.esm.is/guide/extending-routes#route-blocks
 * @see https://github.com/hannoeru/vite-plugin-pages#sfc-route-configuration-blocks
 */
export interface VueRouteBlock {
  path?: string
  name?: string
  alias?: string | string[]
  meta?: RouteMeta
  props?: boolean | Record<string, unknown>
}

export interface VueRouteBlockResult {
  block?: VueRouteBlock
  error?: string
  moduleSources?: string[]
  /** @deprecated Use moduleSources; retained for direct callers. */
  moduleSource?: string
}

function validateRouteBlock(value: unknown): VueRouteBlock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Route block must contain an object.')
  }
  const block = value as Record<string, unknown>
  const supportedFields = new Set(['path', 'name', 'alias', 'meta', 'props'])
  const unknownFields = Object.keys(block).filter((key) => !supportedFields.has(key))
  if (unknownFields.length > 0) {
    throw new TypeError(`Unsupported <route> field(s): ${unknownFields.join(', ')}.`)
  }
  if (block.path !== undefined && typeof block.path !== 'string') throw new TypeError('`path` must be a string.')
  if (block.name !== undefined && typeof block.name !== 'string') throw new TypeError('`name` must be a string.')
  if (
    block.alias !== undefined
    && typeof block.alias !== 'string'
    && (!Array.isArray(block.alias) || block.alias.some((item) => typeof item !== 'string'))
  ) throw new TypeError('`alias` must be a string or string array.')
  if (block.meta !== undefined && (!block.meta || typeof block.meta !== 'object' || Array.isArray(block.meta))) {
    throw new TypeError('`meta` must be an object.')
  }
  if (
    block.props !== undefined
    && typeof block.props !== 'boolean'
    && (!block.props || typeof block.props !== 'object' || Array.isArray(block.props))
  ) throw new TypeError('`props` must be a boolean or object.')
  return block as VueRouteBlock
}

export function readVueRouteBlockResult(source: string, filePath = 'page.vue'): VueRouteBlockResult {
  const parsedSfc = parseSfc(source, { filename: filePath })
  const routeBlocks = parsedSfc.descriptor.customBlocks.filter((item) => item.type === 'route')
  const customBlock = routeBlocks[0]
  const relevantErrors = customBlock
    ? parsedSfc.errors.filter((error) => !String(error).includes('At least one <template> or <script> is required'))
    : parsedSfc.errors
  if (relevantErrors.length > 0) return { error: relevantErrors.map(String).join('\n') }
  const moduleSources = [parsedSfc.descriptor.script?.content, parsedSfc.descriptor.scriptSetup?.content]
    .filter(Boolean)
    .map(String)
  const moduleSource = moduleSources.join('\n')
  if (routeBlocks.length > 1) {
    return { error: 'A Vue page can contain only one <route> block.', moduleSources, moduleSource }
  }
  if (!customBlock) return { moduleSources, moduleSource }
  if (customBlock.src) {
    return { error: '<route src> is not supported; keep route configuration inline.', moduleSources, moduleSource }
  }
  const body = customBlock.content.trim()
  if (!body) return { moduleSources, moduleSource }

  try {
    const lang = customBlock.lang?.toLowerCase() ?? 'json5'
    const value = lang === 'yaml' || lang === 'yml'
      ? parseYaml(body)
      : lang === 'json'
        ? JSON.parse(body)
        : lang === 'json5'
          ? JSON5.parse(body)
          : (() => { throw new TypeError(`Unsupported <route> language: ${lang}`) })()
    return { block: validateRouteBlock(value), moduleSources, moduleSource }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), moduleSources, moduleSource }
  }
}

export function readVueRouteBlock(source: string, filePath?: string): VueRouteBlock | undefined {
  return readVueRouteBlockResult(source, filePath).block
}

/** Remove route custom blocks before @vitejs/plugin-vue compiles the SFC. */
export function stripVueRouteBlocks(source: string, filePath = 'component.vue'): string {
  const parsed = parseSfc(source, { filename: filePath })
  if (parsed.descriptor.customBlocks.length === 0) return source
  let output = source
  for (const block of [...parsed.descriptor.customBlocks].reverse()) {
    if (block.type !== 'route') continue
    const contentStart = block.loc.start.offset
    const contentEnd = block.loc.end.offset
    const tagStart = source.lastIndexOf('<route', contentStart)
    const closeStart = source.indexOf('</route', contentEnd)
    const closeEnd = closeStart >= 0 ? source.indexOf('>', closeStart) + 1 : -1
    if (tagStart < 0 || closeEnd <= 0) continue
    const removed = source.slice(tagStart, closeEnd)
    const blank = removed.replace(/[^\n]/g, ' ')
    output = `${output.slice(0, tagStart)}${blank}${output.slice(closeEnd)}`
  }
  return output
}

export function mergeRouteMeta(
  fromExport?: RouteMeta,
  fromBlock?: RouteMeta,
): RouteMeta | undefined {
  if (!fromExport && !fromBlock) return undefined
  return { ...fromExport, ...fromBlock }
}
