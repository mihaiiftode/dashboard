import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/http"
import { deployments } from "@/test/deployments"
import { createFetchDeploymentsApi } from "./api"

const respondWith = (status: number, body: unknown) => {
  const calls: string[] = []
  const fetcher = (url: string | URL | Request) => {
    calls.push(String(url))
    return Promise.resolve(
      new Response(body === null ? "" : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    )
  }
  return { calls, fetcher: fetcher as typeof globalThis.fetch }
}

describe("createFetchDeploymentsApi", () => {
  it("asks for a page and returns the validated items", async () => {
    const rows = deployments(2)
    const { calls, fetcher } = respondWith(200, { items: rows, checkpoint: null })

    const page = await createFetchDeploymentsApi("http://api.test", fetcher).list({ after: null, limit: 1000 })

    expect(calls[0]).toBe("http://api.test/v1/deployments?limit=1000")
    expect(page.items.map((item) => item.deployment_id)).toEqual(rows.map((row) => row.deployment_id))
  })

  it("sends the checkpoint as the resume parameters", async () => {
    const { calls, fetcher } = respondWith(200, { items: [], checkpoint: null })
    const after = { updated_at: "2026-03-01T12:00:00+00:00", deployment_id: deployments(1)[0].deployment_id }

    await createFetchDeploymentsApi("http://api.test", fetcher).list({ after, limit: 2 })

    const url = new URL(calls[0])
    expect(url.searchParams.get("updated_after")).toBe(after.updated_at)
    expect(url.searchParams.get("after_id")).toBe(after.deployment_id)
    expect(url.searchParams.get("limit")).toBe("2")
  })

  it("raises the problem title and detail when the API rejects the request", async () => {
    const { fetcher } = respondWith(422, {
      type: "about:blank",
      title: "Unprocessable Content",
      status: 422,
      detail: "after_id requires updated_after",
    })

    const failure = createFetchDeploymentsApi("http://api.test", fetcher).list({ after: null, limit: 1 })

    await expect(failure).rejects.toBeInstanceOf(ApiError)
    await expect(failure).rejects.toMatchObject({ status: 422, detail: "after_id requires updated_after" })
  })

  it("refuses a response that does not match the schema", async () => {
    const { fetcher } = respondWith(200, { items: [{ deployment_id: "not-a-uuid" }], checkpoint: null })

    await expect(
      createFetchDeploymentsApi("http://api.test", fetcher).list({ after: null, limit: 1 }),
    ).rejects.toMatchObject({ title: "Malformed response" })
  })
})

const recordingFetcher = (status: number, body: unknown) => {
  const calls: { url: string; init: RequestInit }[] = []
  const fetcher = (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    return Promise.resolve(
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    )
  }
  return { calls, fetcher: fetcher as typeof globalThis.fetch }
}

const writeRequest = (row: ReturnType<typeof deployments>[number], expectedRevision: number | null = null) => ({
  id: row.deployment_id,
  writable: {
    version: row.version,
    status: row.status,
    type: row.type,
    environment: row.environment,
    attributes: row.attributes,
  },
  expectedRevision,
})

describe("the write contract", () => {
  it("reports a successful replace as written and sends If-Match", async () => {
    const [row] = deployments(1)
    const { calls, fetcher } = recordingFetcher(200, row)

    const outcome = await createFetchDeploymentsApi("http://api", fetcher).replace(writeRequest(row, 3))

    expect(outcome).toEqual({ outcome: "written", deployment: row })
    expect(calls[0].init.method).toBe("PUT")
    expect((calls[0].init.headers as Record<string, string>)["if-match"]).toBe('"3"')
  })

  it("reads a 412 body as the winning deployment rather than an error", async () => {
    const [row] = deployments(1)
    const winner = { ...row, revision: row.revision + 1 }
    const { fetcher } = recordingFetcher(412, winner)

    const outcome = await createFetchDeploymentsApi("http://api", fetcher).replace(writeRequest(row, 1))

    expect(outcome).toEqual({ outcome: "conflict", deployment: winner })
  })

  it("raises a 422 problem as an ApiError carrying its detail", async () => {
    const [row] = deployments(1)
    const { fetcher } = recordingFetcher(422, {
      title: "Unprocessable Content",
      detail: "attributes oncall must be an email address",
    })

    await expect(createFetchDeploymentsApi("http://api", fetcher).replace(writeRequest(row))).rejects.toThrow(
      /must be an email address/u,
    )
  })

  it("refuses a success body that does not match the schema", async () => {
    const [row] = deployments(1)
    const { fetcher } = recordingFetcher(200, { deployment_id: row.deployment_id })

    await expect(createFetchDeploymentsApi("http://api", fetcher).replace(writeRequest(row))).rejects.toThrow(
      /malformed response/iu,
    )
  })

  it("accepts an empty 204 body when deleting", async () => {
    const [row] = deployments(1)
    const { calls, fetcher } = recordingFetcher(204, null)

    await expect(createFetchDeploymentsApi("http://api", fetcher).remove(row.deployment_id)).resolves.toBeUndefined()
    expect(calls[0].init.method).toBe("DELETE")
  })

  it("posts a restore and validates the returned deployment", async () => {
    const [row] = deployments(1)
    const { calls, fetcher } = recordingFetcher(200, row)

    await expect(createFetchDeploymentsApi("http://api", fetcher).restore(row.deployment_id)).resolves.toEqual(row)
    expect(calls[0].url).toMatch(/\/restore$/u)
    expect(calls[0].init.method).toBe("POST")
  })
})
