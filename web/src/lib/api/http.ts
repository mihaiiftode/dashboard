import type { ZodType } from "zod"

type Problem = {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: unknown[]
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly body?: unknown,
  ) {
    super(detail ? `${title}: ${detail}` : title)
    this.name = "ApiError"
  }
}

export type Fetcher = typeof globalThis.fetch

export async function requestJson<T>(
  fetcher: Fetcher,
  url: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(url, init)
  const body = await readBody(response)
  if (!response.ok) throw problemFrom(response.status, body)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(response.status, "Malformed response", parsed.error.issues[0]?.message, body)
  }
  return parsed.data
}

export async function requestVoid(fetcher: Fetcher, url: string, init?: RequestInit): Promise<void> {
  const response = await fetcher(url, init)
  if (!response.ok) throw problemFrom(response.status, await readBody(response))
}

const readBody = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const problemFrom = (status: number, body: unknown): ApiError => {
  const problem = body as Partial<Problem> | null
  return new ApiError(status, problem?.title ?? `Request failed with ${status}`, problem?.detail, body)
}
