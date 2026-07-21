#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

import { generateRouteFiles, resolveOptions, scanPages } from '../dist/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const generatedDir = path.join(__dirname, '.generated')
const projects = ['react-7', 'vue-5']

function resolveTscBin(pkgRoot) {
  try {
    const req = createRequire(path.join(pkgRoot, 'package.json'))
    const pkgPath = req.resolve('typescript/package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.tsc
    if (!rel) throw new Error('missing tsc bin')
    return path.join(path.dirname(pkgPath), rel)
  } catch {
    const pkgPath = require.resolve('typescript/package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.tsc
    return path.join(path.dirname(pkgPath), rel ?? 'bin/tsc')
  }
}

function generateRoutes(fixtureName, framework, outName) {
  const fixtureRoot = path.join(__dirname, 'fixtures', fixtureName)
  const outFile = path.join(generatedDir, outName)
  const resolved = resolveOptions(fixtureRoot, {
    framework,
    pagesDir: 'pages',
    outFile,
    logDiagnostics: false,
  })
  const rootNode = scanPages(resolved)
  const { routesContent } = generateRouteFiles(resolved, rootNode)
  fs.mkdirSync(generatedDir, { recursive: true })
  fs.writeFileSync(outFile, routesContent, 'utf-8')
  return outFile
}

function runTsc(projectDir) {
  const bin = resolveTscBin(projectDir)
  execFileSync(bin, ['--noEmit', '-p', path.join(projectDir, 'tsconfig.json')], {
    cwd: projectDir,
    stdio: 'inherit',
  })
}

generateRoutes('react', 'react', 'react-routes.ts')
generateRoutes('vue', 'vue', 'vue-routes.ts')

const reactRoutes = fs.readFileSync(path.join(generatedDir, 'react-routes.ts'), 'utf-8')
if (!reactRoutes.includes('HydrateFallback: RouteLoading')) {
  throw new Error('[compat] react routes must emit root HydrateFallback when pages/loading.tsx exists')
}
if (!reactRoutes.includes('ErrorBoundary: RouteError')) {
  throw new Error('[compat] react routes must emit root ErrorBoundary when pages/error.tsx exists')
}

for (const name of projects) {
  const dir = path.join(__dirname, name)
  console.log(`\n[compat] tsc ${name}`)
  runTsc(dir)
}

console.log('\n[compat] all router type checks passed')
