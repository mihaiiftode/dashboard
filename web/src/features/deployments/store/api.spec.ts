import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/http"
import { deployments } from "@/test/deployments"
import { createFetchDeploymentsApi } from "./api"

const respondWith = (status: number, body: unknown) => {
  const calls: string[] = []
  const fetcher = async (url: string | URL | Request) => {
    calls.push(String(url))
    return new Response(body === null ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
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
