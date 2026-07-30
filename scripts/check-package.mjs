#!/usr/bin/env node
import { execFileSync } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const output = execFileSync(npm, ['pack', '--dry-run', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const [pack] = JSON.parse(output)
if (!pack) throw new Error('npm pack did not return package metadata.')

const expectedFiles = new Set([
  'CHANGELOG.md',
  'README.en.md',
  'README.md',
  'bench/run.mjs',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.js',
  'package.json',
])
const actualFiles = new Set(pack.files.map((file) => file.path))
const missing = [...expectedFiles].filter((file) => !actualFiles.has(file))
const unexpected = [...actualFiles].filter((file) => !expectedFiles.has(file))
if (missing.length || unexpected.length) {
  throw new Error([
    'Unexpected npm package contents.',
    missing.length ? 'Missing: ' + missing.join(', ') : '',
    unexpected.length ? 'Unexpected: ' + unexpected.join(', ') : '',
  ].filter(Boolean).join('\n'))
}

const MAX_TARBALL_BYTES = 65 * 1024
const MAX_UNPACKED_BYTES = 200 * 1024
if (pack.size > MAX_TARBALL_BYTES) {
  throw new Error('Tarball size ' + pack.size + ' exceeds budget ' + MAX_TARBALL_BYTES + '.')
}
if (pack.unpackedSize > MAX_UNPACKED_BYTES) {
  throw new Error('Unpacked size ' + pack.unpackedSize + ' exceeds budget ' + MAX_UNPACKED_BYTES + '.')
}

console.log(JSON.stringify({
  name: pack.name,
  version: pack.version,
  files: pack.files.length,
  size: pack.size,
  unpackedSize: pack.unpackedSize,
  integrity: pack.integrity,
}, null, 2))
