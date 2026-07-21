#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rollup } from 'rollup'
import dts from 'rollup-plugin-dts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const distDir = path.join(__dirname, 'dist')

function resolveBin(pkg, key) {
  const pkgPath = require.resolve(`${pkg}/package.json`)
  const { bin } = require(pkgPath)
  const rel = typeof bin === 'string' ? bin : bin?.[key]
  if (!rel) throw new Error(`Cannot resolve bin "${key}" for ${pkg}`)
  return path.join(path.dirname(pkgPath), rel)
}

function cleanDist() {
  if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })
}

function pruneDist() {
  for (const name of readdirSync(distDir)) {
    const filePath = path.join(distDir, name)
    if (statSync(filePath).isDirectory()) {
      rmSync(filePath, { recursive: true, force: true })
      continue
    }
    if (name !== 'index.js' && name !== 'index.cjs' && name !== 'index.d.ts') {
      rmSync(filePath, { force: true })
    }
  }
}

const esbuild = resolveBin('esbuild', 'esbuild')
const runtimeExternals = ['@babel/parser', '@vue/compiler-sfc', 'json5', 'yaml']

cleanDist()

execFileSync(
  esbuild,
  [
    'src/index.ts',
    '--bundle',
    '--minify',
    '--platform=node',
    '--format=esm',
    '--external:node:*',
    '--external:vite',
    ...runtimeExternals.map((dependency) => `--external:${dependency}`),
    `--outfile=${path.join(distDir, 'index.js')}`,
  ],
  { cwd: __dirname, stdio: 'inherit' },
)

execFileSync(
  esbuild,
  [
    'src/index.ts',
    '--bundle',
    '--minify',
    '--platform=node',
    '--format=cjs',
    '--external:node:*',
    '--external:vite',
    ...runtimeExternals.map((dependency) => `--external:${dependency}`),
    '--banner:js=const __importMetaUrl=require("url").pathToFileURL(__filename).href;',
    '--define:import.meta.url=__importMetaUrl',
    `--outfile=${path.join(distDir, 'index.cjs')}`,
  ],
  { cwd: __dirname, stdio: 'inherit' },
)

const bundle = await rollup({
  input: path.join(__dirname, 'src/index.ts'),
  plugins: [dts()],
})

await bundle.write({ file: path.join(distDir, 'index.d.ts'), format: 'es' })

pruneDist()

console.log('vite-plugin-file-router built successfully.')
