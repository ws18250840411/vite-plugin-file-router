import { describe, expect, it } from 'vitest'

import { inferOutputLanguage } from '../core/output-language'

describe('inferOutputLanguage', () => {
  it('defaults to ts for .ts and unknown extensions', () => {
    expect(inferOutputLanguage('/app/src/routes.ts')).toBe('ts')
    expect(inferOutputLanguage('/app/src/routes.tsx')).toBe('ts')
    expect(inferOutputLanguage('/app/src/routes')).toBe('ts')
  })

  it('returns js for javascript extensions', () => {
    expect(inferOutputLanguage('/app/src/routes.js')).toBe('js')
    expect(inferOutputLanguage('/app/src/routes.mjs')).toBe('js')
    expect(inferOutputLanguage('/app/src/routes.cjs')).toBe('js')
  })
})
