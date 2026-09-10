export class ResizeObserverStub implements ResizeObserver {
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
