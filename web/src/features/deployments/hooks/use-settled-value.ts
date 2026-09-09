"use client"

import { useEffect, useState } from "react"

export const useSettledValue = <T>(value: T, settleMs: number): T => {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (value === settled) return
    const timer = window.setTimeout(() => setSettled(value), settleMs)
    return () => window.clearTimeout(timer)
  }, [value, settled, settleMs])
  return settled
}
