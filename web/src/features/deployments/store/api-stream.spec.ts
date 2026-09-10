import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFetchDeploymentsApi } from "./api"

class FakeEventSource {
  static last: FakeEventSource | null = null
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>()
  closed = false

  constructor(readonly url: string) {
    FakeEventSource.last = this
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, listener)
  }

  close() {
    this.closed = true
  }

  deliver(data: string) {
    this.listeners.get("message")?.({ data } as MessageEvent<string>)
  }
}

const original = globalThis.EventSource

beforeEach(() => {
  Object.defineProperty(globalThis, "EventSource", { value: FakeEventSource, configurable: true, writable: true })
})

afterEach(() => {
  Object.defineProperty(globalThis, "EventSource", { value: original, configurable: true, writable: true })
})

const listen = () => {
  const onChanged = vi.fn<() => void>()
  const onError = vi.fn<() => void>()
  const unsubscribe = createFetchDeploymentsApi("http://api", globalThis.fetch).subscribe({
    onOpen: vi.fn<() => void>(),
    onChanged,
    onError,
  })
  const source = FakeEventSource.last
  if (!source) throw new Error("no EventSource opened")
  return { onChanged, onError, unsubscribe, source }
}

describe("the change stream contract", () => {
  it.each(["{not json", '{"documents":"nope"}', '{"documents":[]}'])(
    "asks for a pull whatever the frame carries: %s",
    (frame) => {
      const listener = listen()
      listener.source.deliver(frame)
      expect(listener.onChanged).toHaveBeenCalledTimes(1)
    },
  )

  it("asks for a pull when the server signals overflow", () => {
    const listener = listen()
    listener.source.listeners.get("resync")?.({ data: "{}" } as MessageEvent<string>)
    expect(listener.onChanged).toHaveBeenCalledTimes(1)
  })

  it("keeps the connection reported as live while recovering from overflow", () => {
    const listener = listen()
    listener.source.listeners.get("resync")?.({ data: "{}" } as MessageEvent<string>)
    expect(listener.onError).not.toHaveBeenCalled()
  })

  it("closes the source when the caller unsubscribes", () => {
    const { unsubscribe, source } = listen()

    unsubscribe()

    expect(source.closed).toBe(true)
  })
})
