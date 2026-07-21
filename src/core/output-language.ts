import path from 'node:path'

export type OutputLanguage = 'ts' | 'js'

/** Infer generated routes syntax from `outFile` extension (`.js` → JS, default TS). */
export function inferOutputLanguage(outFile: string): OutputLanguage {
  const ext = path.extname(outFile).toLowerCase()
  if (ext === '.cjs') throw new TypeError('Generated client routes are ESM; use a .ts, .js, or .mjs outFile.')
  if (ext === '.js' || ext === '.mjs') return 'js'
  return 'ts'
}
