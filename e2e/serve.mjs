#!/usr/bin/env node
/**
 * Start React + Vue e2e dev servers and wait until generated routes.ts exist.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function waitForRoutesFile(file, mustInclude, timeoutMs = 30_000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (existsSync(file)) {
        try {
          const text = readFileSync(file, 'utf-8')
          if (text.includes(mustInclude)) {
            resolve()
            return
          }
        } catch {
          // retry
        }
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for routes file ${file}`))
        return
      }
      setTimeout(tick, 100)
    }
    tick()
  })
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // server not ready
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Timeout waiting for ${url}`)
}

function startVite(config, port) {
  return spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', '--config', config, '--port', String(port), '--strictPort'],
    { cwd: root, stdio: 'inherit', env: process.env },
  )
}

const reactRoutes = path.join(root, 'demo/react/src/routes.ts')
const vueRoutes = path.join(root, 'demo/vue/src/routes.ts')

const children = []

function track(proc) {
  children.push(proc)
  proc.on('exit', (code) => {
    if (code && code !== 0) process.exit(code)
  })
  return proc
}

async function boot(config, port, routesFile, marker) {
  track(startVite(config, port))
  await Promise.all([
    waitForRoutesFile(routesFile, marker),
    waitForHttp(`http://localhost:${port}/`),
  ])
}

try {
  await Promise.all([
    boot('demo/react/vite.config.ts', 5199, reactRoutes, 'export default routes'),
    boot('demo/vue/vite.config.ts', 5200, vueRoutes, 'export default routes'),
  ])

  const { createServer } = await import('node:http')
  createServer((_req, res) => {
    res.writeHead(200)
    res.end('ok')
  }).listen(5298)
} catch (err) {
  for (const proc of children) proc.kill()
  console.error(err)
  process.exit(1)
}

const shutdown = () => {
  for (const proc of children) proc.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await new Promise(() => {})
