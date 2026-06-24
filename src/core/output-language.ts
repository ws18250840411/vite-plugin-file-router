import path from 'node:path'

export type OutputLanguage = 'ts' | 'js'

/** Infer generated routes syntax from `outFile` extension (`.js` → JS, default TS). */
export function inferOutputLanguage(outFile: string): OutputLanguage {
  const ext = path.extname(outFile).toLowerCase()
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'js'
  return 'ts'
}
