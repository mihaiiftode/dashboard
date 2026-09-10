"use client"

export type VisibleRange = { start: number; end: number }

export type VisibleRangeStore = {
  subscribe: (listener: () => void) => () => void
  snapshot: () => VisibleRange
  publish: (next: VisibleRange) => void
}

export const nothingVisible: VisibleRange = { start: 0, end: 0 }

export const createVisibleRangeStore = (): VisibleRangeStore => {
  const listeners = new Set<() => void>()
  let current = nothingVisible
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot: () => current,
    publish: (next) => {
      if (current.start === next.start && current.end === next.end) return
      current = next
      for (const listener of listeners) listener()
    },
  }
}
