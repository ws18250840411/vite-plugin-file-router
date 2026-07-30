import type { ModalRouteNode, RouteNode } from './types'

export interface InspectOptions {
  colors?: boolean
}

function dim(text: string, colors: boolean): string {
  return colors ? `\x1b[2m${text}\x1b[0m` : text
}

function green(text: string, colors: boolean): string {
  return colors ? `\x1b[32m${text}\x1b[0m` : text
}

function cyan(text: string, colors: boolean): string {
  return colors ? `\x1b[36m${text}\x1b[0m` : text
}

function yellow(text: string, colors: boolean): string {
  return colors ? `\x1b[33m${text}\x1b[0m` : text
}

function magenta(text: string, colors: boolean): string {
  return colors ? `\x1b[35m${text}\x1b[0m` : text
}

function formatSegment(node: RouteNode, colors: boolean): string {
  const path = node.urlPath || '/'
  const parts: string[] = [green(path, colors)]
  if (node.layoutPath) parts.push(dim('[layout]', colors))
  if (node.isGroup) parts.push(dim(`(${node.groupName})`, colors))
  if (node.isNotFound) parts.push(yellow('[404]', colors))
  if (node.meta) parts.push(dim(`meta:${JSON.stringify(node.meta)}`, colors))
  if (node.searchParams) parts.push(cyan(`?${Object.keys(node.searchParams).join('&')}`, colors))
  if (node.moduleExports?.loader) parts.push(dim('[loader]', colors))
  if (node.moduleExports?.action) parts.push(dim('[action]', colors))
  return parts.join(' ')
}

function renderTree(
  node: RouteNode,
  prefix: string,
  isLast: boolean,
  colors: boolean,
  lines: string[],
  depth = 0,
): void {
  const connector = depth === 0 ? '' : isLast ? '└── ' : '├── '
  const segment = formatSegment(node, colors)
  if (depth > 0 || node.filePath || node.layoutPath) {
    lines.push(`${prefix}${connector}${segment}`)
  }

  const childPrefix = depth === 0 ? '' : prefix + (isLast ? '    ' : '│   ')
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    renderTree(children[i], childPrefix, i === children.length - 1, colors, lines, depth + 1)
  }
}

function renderModals(modals: ModalRouteNode[], colors: boolean): string[] {
  if (modals.length === 0) return []
  const lines = ['', magenta('Modal Routes:', colors)]
  for (const modal of modals) {
    lines.push(`  ${magenta('+', colors)} ${green(modal.path, colors)}`)
  }
  return lines
}

function renderSlots(slots: Record<string, RouteNode> | undefined, colors: boolean): string[] {
  if (!slots || Object.keys(slots).length === 0) return []
  const lines = ['', cyan('Parallel Slots:', colors)]
  for (const [name, node] of Object.entries(slots)) {
    lines.push(`  ${cyan(`@${name}`, colors)}`)
    for (const child of node.children) {
      if (child.filePath) {
        lines.push(`    ${green(child.urlPath || '/', colors)}`)
      }
    }
  }
  return lines
}

/**
 * Generate a visual tree representation of the route structure.
 * Useful for debugging and documentation.
 */
export function inspectRoutes(root: RouteNode, options: InspectOptions = {}): string {
  const colors = options.colors ?? (typeof process !== 'undefined' && process.stdout?.isTTY)
  const lines: string[] = []

  renderTree(root, '', true, colors, lines)

  const allModals: ModalRouteNode[] = []
  function collectModals(node: RouteNode) {
    if (node.modals) allModals.push(...node.modals)
    for (const child of node.children) collectModals(child)
  }
  collectModals(root)
  lines.push(...renderModals(allModals, colors))
  lines.push(...renderSlots(root.slots, colors))

  const pageCount = countPages(root)
  lines.push('')
  lines.push(dim(`${pageCount} routes${allModals.length ? `, ${allModals.length} modals` : ''}${root.slots ? `, ${Object.keys(root.slots).length} slots` : ''}`, colors))

  return lines.join('\n')
}

function countPages(node: RouteNode): number {
  let count = node.filePath ? 1 : 0
  for (const child of node.children) count += countPages(child)
  return count
}
