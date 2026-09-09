"use client"

import { useEffect } from "react"

export const useSlashFocus = (elementId: string) => {
  useEffect(() => {
    const focusOnSlash = (event: KeyboardEvent) => {
      if (event.key !== "/" || isTyping(event.target)) return
      event.preventDefault()
      document.querySelector<HTMLElement>(`#${elementId}`)?.focus()
    }
    window.addEventListener("keydown", focusOnSlash)
    return () => window.removeEventListener("keydown", focusOnSlash)
  }, [elementId])
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable)
