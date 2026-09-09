import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterEach } from "vitest"

configure({ asyncUtilTimeout: 5000 })

afterEach(cleanup)

const VIEWPORT = { width: 1280, height: 800 }

if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })
}

window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 0)
window.cancelAnimationFrame = (handle) => window.clearTimeout(handle)

if (typeof window.HTMLElement.prototype.scrollIntoView !== "function") {
  window.HTMLElement.prototype.scrollIntoView = () => undefined
}

if (typeof window.PointerEvent !== "function") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? "mouse"
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
}

if (typeof window.ResizeObserver !== "function") {
  class ResizeObserverStub implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const rect = target.getBoundingClientRect()
      const size = [{ inlineSize: rect.width, blockSize: rect.height }]
      const entry = { target, contentRect: rect, borderBoxSize: size, contentBoxSize: size }
      this.callback([entry as unknown as ResizeObserverEntry], this)
    }
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub
}

const measure = window.Element.prototype.getBoundingClientRect
window.Element.prototype.getBoundingClientRect = function boundingRect(this: Element): DOMRect {
  const rect = measure.call(this)
  if (rect.width !== 0 || rect.height !== 0) return rect
  return {
    ...VIEWPORT,
    top: 0,
    left: 0,
    right: VIEWPORT.width,
    bottom: VIEWPORT.height,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  }
}
