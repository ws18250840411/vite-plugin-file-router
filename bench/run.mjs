#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { resolveOptions, runGeneration } from '../dist/index.js'

const routeCounts = (process.env.BENCH_ROUTES ?? '1000,10000')
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0)
const frameworks = (process.env.BENCH_FRAMEWORKS ?? 'react,vue')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value === 'react' || value === 'vue')

function memoryMb() {
  const memory = process.memoryUsage()
  return {
    heap: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
    rss: Number((memory.rss / 1024 / 1024).toFixed(1)),
  }
}

function timed(run) {
  global.gc?.()
  const before = memoryMb()
  const start = performance.now()
  const value = run()
  const durationMs = performance.now() - start
  const after = memoryMb()
  return {
    changed: value.changed,
    ms: Number(durationMs.toFixed(1)),
    routesPerSecond: durationMs > 0 ? Math.round((value.routeCount / durationMs) * 1000) : null,
    heapDeltaMb: Number((after.heap - before.heap).toFixed(1)),
    rssDeltaMb: Number((after.rss - before.rss).toFixed(1)),
    heapMb: after.heap,
    rssMb: after.rss,
  }
}

function writePages(pagesDir, count, framework) {
  fs.mkdirSync(pagesDir, { recursive: true })
  for (let index = 0; index < count; index++) {
    const source = framework === 'vue'
      ? index % 10 === 0
        ? `<script>export const meta = { index: ${index}, bucket: ${index % 100} }</script>\n<template><div /></template>\n`
        : '<template><div /></template>\n'
      : `export default function Page${index}() { return null }${index % 10 === 0
        ? `\nexport const meta = { index: ${index}, bucket: ${index % 100} }\nexport async function loader() { return ${index} }`
        : ''}\n`
    fs.writeFileSync(
      path.join(pagesDir, `page-${index}.${framework === 'vue' ? 'vue' : 'tsx'}`),
      source,
    )
  }
}

function applyUserEdits(routesFile, count, extension) {
  const interval = Math.max(1, Math.floor(count / 100))
  const source = fs.readFileSync(routesFile, 'utf8')
  const edited = source.replace(
    new RegExp(`(/\\* @file-route "page:page-(\\d+)\\.${extension}" \\*/\\s*\\{)`, 'g'),
    (match, head, rawIndex) => Number(rawIndex) % interval === 0
      ? `${head}\n    handle: { benchmarkEdit: ${rawIndex} },`
      : match,
  )
  fs.writeFileSync(routesFile, edited)
}

function applyChurn(pagesDir, count, framework) {
  const churnCount = Math.max(1, Math.floor(count / 100))
  const extension = framework === 'vue' ? 'vue' : 'tsx'
  for (let index = 0; index < churnCount; index++) {
    fs.unlinkSync(path.join(pagesDir, `page-${index}.${extension}`))
    fs.writeFileSync(
      path.join(pagesDir, `added-${index}.${extension}`),
      framework === 'vue'
        ? '<template><div /></template>\n'
        : `export default function Added${index}() { return null }\n`,
    )
  }
  return churnCount
}

function benchmark(routeCount, framework) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vfr-bench-${framework}-${routeCount}-`))
  const pagesDir = path.join(root, 'src', 'pages')
  const routesFile = path.join(root, 'src', 'routes.ts')
  try {
    const fixtureStart = performance.now()
    writePages(pagesDir, routeCount, framework)
    const fixtureMs = Number((performance.now() - fixtureStart).toFixed(1))
    const resolved = resolveOptions(root, { framework, logDiagnostics: false })
    const run = () => ({ changed: runGeneration(resolved, () => {}, () => {}).changed, routeCount })

    const cold = timed(run)
    const outputBytes = fs.statSync(routesFile).size
    const noop = timed(run)

    const extension = framework === 'vue' ? 'vue' : 'tsx'
    applyUserEdits(routesFile, routeCount, extension)
    const churnCount = applyChurn(pagesDir, routeCount, framework)
    const merge = timed(run)
    const mergedSource = fs.readFileSync(routesFile, 'utf8')
    const preservedEdits = (mergedSource.match(/benchmarkEdit:/g) ?? []).length

    return {
      routes: routeCount,
      framework,
      fixtureMs,
      outputMb: Number((outputBytes / 1024 / 1024).toFixed(2)),
      churnedRoutes: churnCount,
      preservedEdits,
      cold,
      noop,
      merge,
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

if (routeCounts.length === 0) throw new Error('BENCH_ROUTES must contain positive integers.')
if (frameworks.length === 0) throw new Error('BENCH_FRAMEWORKS must contain react or vue.')

const results = frameworks.flatMap((framework) => routeCounts.map((routeCount) => benchmark(routeCount, framework)))
console.table(results.flatMap((result) => [
  { framework: result.framework, routes: result.routes, phase: 'cold', ms: result.cold.ms, routesPerSecond: result.cold.routesPerSecond, rssMb: result.cold.rssMb },
  { framework: result.framework, routes: result.routes, phase: 'noop', ms: result.noop.ms, routesPerSecond: result.noop.routesPerSecond, rssMb: result.noop.rssMb },
  { framework: result.framework, routes: result.routes, phase: 'merge-1%', ms: result.merge.ms, routesPerSecond: result.merge.routesPerSecond, rssMb: result.merge.rssMb },
]))
console.log(JSON.stringify({ node: process.version, platform: `${process.platform}-${process.arch}`, results }, null, 2))
