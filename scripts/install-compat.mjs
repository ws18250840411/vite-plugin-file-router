#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
for (const project of ['react-7', 'vue-5']) {
  execFileSync(npm, ['ci', '--ignore-scripts'], {
    cwd: path.resolve('compat', project),
    stdio: 'inherit',
  })
}

execFileSync(process.execPath, [path.resolve('compat', 'run.mjs')], {
  cwd: process.cwd(),
  stdio: 'inherit',
})
