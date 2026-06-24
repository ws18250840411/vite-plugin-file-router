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
    expect(count).toBe(2)

    scheduler.dispose()
  })
})
