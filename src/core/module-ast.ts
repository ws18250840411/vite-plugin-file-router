import { parse } from '@babel/parser'

import type { RouteMeta } from '../types'

export interface ParsedModule {
  ast: ReturnType<typeof parse>
  source: string
}

export function parseModule(source: string, filePath = 'module.ts'): ParsedModule {
  const isTypeScript = /\.[cm]?tsx?$/i.test(filePath) || filePath.endsWith('.vue')
  const isJsx = /\.[cm]?[jt]sx$/i.test(filePath)
  return {
    ast: parse(source, {
      sourceType: 'module',
      sourceFilename: filePath,
      allowAwaitOutsideFunction: true,
      plugins: [
        ...(isTypeScript ? (['typescript'] as const) : []),
        ...(isJsx ? (['jsx'] as const) : []),
        'decorators-legacy',
        'importAttributes',
        'explicitResourceManagement',
      ],
    }),
    source,
  }
}

function exportedName(node: any): string | undefined {
  if (!node) return undefined
  if (node.type === 'Identifier') return node.name
  if (node.type === 'StringLiteral') return node.value
  return undefined
}

function declarationNames(declaration: any): string[] {
  if (!declaration) return []
  if (declaration.id?.name) return [declaration.id.name]
  if (declaration.type !== 'VariableDeclaration') return []
  return declaration.declarations.flatMap((item: any) => item.id?.type === 'Identifier' ? [item.id.name] : [])
}

export function collectRuntimeExports(parsed: ParsedModule): Set<string> {
  const names = new Set<string>()
  for (const statement of parsed.ast.program.body as any[]) {
    if (statement.type === 'ExportDefaultDeclaration') {
      if (!String(statement.declaration?.type ?? '').startsWith('TS')) names.add('default')
      continue
    }
    if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') continue
    for (const name of declarationNames(statement.declaration)) names.add(name)
    for (const specifier of statement.specifiers ?? []) {
      if (specifier.exportKind === 'type') continue
      const name = exportedName(specifier.exported)
      if (name) names.add(name)
    }
  }
  return names
}

function unwrapExpression(node: any): any {
  let current = node
  while (
    current
    && ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TypeCastExpression'].includes(current.type)
  ) {
    current = current.expression
  }
  return current
}

function literalValue(node: any): unknown {
  const value = unwrapExpression(node)
  if (!value) return undefined
  if (value.type === 'StringLiteral' || value.type === 'NumericLiteral' || value.type === 'BooleanLiteral') {
    return value.value
  }
  if (value.type === 'NullLiteral') return null
  if (value.type === 'UnaryExpression' && (value.operator === '-' || value.operator === '+')) {
    const inner = literalValue(value.argument)
    return typeof inner === 'number' ? (value.operator === '-' ? -inner : inner) : undefined
  }
  if (value.type === 'TemplateLiteral' && value.expressions.length === 0) {
    return value.quasis[0]?.value?.cooked ?? ''
  }
  if (value.type === 'ArrayExpression') {
    const array: unknown[] = []
    for (const element of value.elements) {
      const parsed = literalValue(element)
      if (parsed === undefined) return undefined
      array.push(parsed)
    }
    return array
  }
  if (value.type === 'ObjectExpression') {
    const object: Record<string, unknown> = {}
    for (const property of value.properties) {
      if (property.type !== 'ObjectProperty' || property.computed) return undefined
      const key = exportedName(property.key) ?? (property.key?.type === 'NumericLiteral' ? String(property.key.value) : undefined)
      if (!key) return undefined
      const parsed = literalValue(property.value)
      if (parsed === undefined) return undefined
      object[key] = parsed
    }
    return object
  }
  return undefined
}

export function readStaticMetaFromAst(parsed: ParsedModule): RouteMeta | undefined {
  for (const statement of parsed.ast.program.body as any[]) {
    if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') continue
    for (const declaration of statement.declaration.declarations) {
      if (declaration.id?.type !== 'Identifier' || declaration.id.name !== 'meta') continue
      let value = unwrapExpression(declaration.init)
      if (value?.type === 'CallExpression') value = value.arguments[0]
      const meta = literalValue(value)
      if (meta && typeof meta === 'object' && !Array.isArray(meta)) return meta as RouteMeta
    }
  }
  return undefined
}
