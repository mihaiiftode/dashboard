import { describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import type { DeploymentsApi, ListRequest } from "./api"
import { seedRows } from "./seed"
import type { Deployment, DeploymentPage } from "./schema"

const pagingApi = (rows: Deployment[], pageSize: number): DeploymentsApi => {
  const list = ({ after, limit }: ListRequest): Promise<DeploymentPage> => {
    const start = after === null ? 0 : rows.findIndex((row) => row.deployment_id === after.deployment_id) + 1
    const items = rows.slice(start, start + Math.min(limit, pageSize))
    const exhausted = start + items.length >= rows.length
    const last = items.at(-1)
    return Promise.resolve({
      items,
      checkpoint:
        exhausted || last === undefined ? null : { updated_at: last.updated_at, deployment_id: last.deployment_id },
    })
  }
  return { list } as DeploymentsApi
}

describe("seedRows", () => {
  it("reports the checkpoint of the last row it read, not of the page before it", async () => {
    const rows = deployments(5)

    const seeded = await seedRows(100, pagingApi(rows, 2))

    expect(seeded.rows).toHaveLength(5)
    expect(seeded.checkpoint?.deployment_id).toBe(rows[4]?.deployment_id)
  })

  it("reports a checkpoint when every row fits in one page", async () => {
    const rows = deployments(3)

    const seeded = await seedRows(100, pagingApi(rows, 10))

    expect(seeded.checkpoint?.deployment_id).toBe(rows[2]?.deployment_id)
  })

  it("reports no checkpoint when there is nothing to read", async () => {
    const seeded = await seedRows(100, pagingApi([], 10))

    expect(seeded).toEqual({ rows: [], checkpoint: null })
  })
})
