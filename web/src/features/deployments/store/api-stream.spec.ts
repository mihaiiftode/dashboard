import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { deployments } from "@/test/deployments"
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
  const onEvent = vi.fn<(event: unknown) => void>()
  const unsubscribe = createFetchDeploymentsApi("http://api", globalThis.fetch).subscribe({
    onEvent,
    onOpen: vi.fn<() => void>(),
    onError: vi.fn<() => void>(),
  })
  const source = FakeEventSource.last
  if (!source) throw new Error("no EventSource opened")
  return { onEvent, unsubscribe, source }
}

describe("the change stream contract", () => {
  it("delivers a well formed change event", () => {
    const [row] = deployments(1)
    const { onEvent, source } = listen()

    source.deliver(
      JSON.stringify({
        documents: [row],
        checkpoint: { updated_at: row.updated_at, deployment_id: row.deployment_id },
      }),
    )

    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it("ignores a frame that is not valid JSON instead of throwing", () => {
    const { onEvent, source } = listen()

    expect(() => source.deliver("{not json")).not.toThrow()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it("ignores a frame that does not match the schema", () => {
    const { onEvent, source } = listen()

    source.deliver(JSON.stringify({ documents: "nope" }))

    expect(onEvent).not.toHaveBeenCalled()
  })

  it("closes the source when the caller unsubscribes", () => {
    const { unsubscribe, source } = listen()

    unsubscribe()

    expect(source.closed).toBe(true)
  })
})
