import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRegenScheduler } from '../plugin'

describe('regen-scheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces rapid schedule calls into one run', () => {
    vi.useFakeTimers()
    const runs: number[] = []
    const scheduler = createRegenScheduler(() => runs.push(Date.now()), 50)

    scheduler.schedule()
    scheduler.schedule()
    scheduler.schedule()
    expect(runs).toHaveLength(0)

    vi.advanceTimersByTime(49)
    expect(runs).toHaveLength(0)

    vi.advanceTimersByTime(1)
    expect(runs).toHaveLength(1)

    scheduler.dispose()
  })

  it('serializes overlapping runNow calls with a follow-up flush', () => {
    let depth = 0
    let maxDepth = 0
    let calls = 0
    const scheduler = createRegenScheduler(() => {
      calls++
      depth++
      maxDepth = Math.max(maxDepth, depth)
      if (calls === 1) scheduler.runNow()
      depth--
    }, 0)

    scheduler.runNow()
    expect(calls).toBe(2)
    expect(maxDepth).toBe(1)
  })

  it('runNow bypasses debounce timer', () => {
    vi.useFakeTimers()
    let count = 0
    const scheduler = createRegenScheduler(() => count++, 100)

    scheduler.schedule()
    scheduler.runNow()
    expect(count).toBe(1)

    vi.advanceTimersByTime(100)
    expect(count).toBe(1)

    scheduler.dispose()
  })

  it('reports scheduled failures without poisoning later runs', () => {
    vi.useFakeTimers()
    const error = new Error('invalid route')
    const failures: unknown[] = []
    let runs = 0
    const scheduler = createRegenScheduler(() => {
      runs++
      if (runs === 1) throw error
    }, 10, (reason) => failures.push(reason))

    scheduler.schedule()
    expect(() => vi.advanceTimersByTime(10)).not.toThrow()
    expect(failures).toEqual([error])

    scheduler.schedule()
    vi.advanceTimersByTime(10)
    expect(runs).toBe(2)
    scheduler.dispose()
  })

  it('keeps runNow failures synchronous for build gating', () => {
    const error = new Error('invalid route')
    const scheduler = createRegenScheduler(() => { throw error }, 10, () => {})

    expect(() => scheduler.runNow()).toThrow(error)
    scheduler.dispose()
  })
})
