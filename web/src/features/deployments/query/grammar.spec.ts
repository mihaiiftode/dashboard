import { describe, expect, it } from "vitest"
import { addValue, parse, parseToken, removeToken, replaceSpan, spanAt, splitTokens, upsertDirective } from "./grammar"

describe("splitTokens", () => {
  it("splits on spaces and keeps quoted runs together", () => {
    expect(splitTokens('status:failed name:"order gateway" text').map((span) => span.raw)).toEqual([
      "status:failed",
      'name:"order gateway"',
      "text",
    ])
  })

  it("reports the offset of every token so chips can key on it", () => {
    expect(splitTokens("  a  bb ")).toEqual([
      { start: 2, end: 3, raw: "a" },
      { start: 5, end: 7, raw: "bb" },
    ])
  })
})

describe("parseToken", () => {
  it("reads bare text as a haystack search and strips quotes", () => {
    expect(parseToken("payment")).toEqual({ kind: "text", raw: "payment", text: "payment" })
    expect(parseToken('"order gateway"')).toMatchObject({ kind: "text", text: "order gateway" })
  })

  it("reads a field token with a single value", () => {
    expect(parseToken("status:failed")).toEqual({
      kind: "field",
      raw: "status:failed",
      key: "status",
      values: ["failed"],
      negated: false,
      op: undefined,
    })
  })

  it("reads commas as alternative values", () => {
    expect(parseToken("status:failed,stopped")).toMatchObject({ values: ["failed", "stopped"] })
  })

  it("reads a leading dash as negation", () => {
    expect(parseToken("-status:failed")).toMatchObject({ key: "status", values: ["failed"], negated: true })
  })

  it("keeps a glob in the value untouched", () => {
    expect(parseToken("name:pay*")).toMatchObject({ values: ["pay*"] })
  })

  it("reads a relative date comparison and its operator", () => {
    expect(parseToken("created:<7d")).toMatchObject({ key: "created", values: ["7d"], op: "<" })
    expect(parseToken("created:>2w")).toMatchObject({ key: "created", values: ["2w"], op: ">" })
  })

  it("reads key presence and its negation", () => {
    expect(parseToken("has:oncall")).toEqual({ kind: "has", raw: "has:oncall", key: "oncall", negated: false })
    expect(parseToken("-has:oncall")).toMatchObject({ kind: "has", key: "oncall", negated: true })
  })

  it("reads the scope token", () => {
    expect(parseToken("is:deleted")).toEqual({ kind: "is", raw: "is:deleted", value: "deleted", negated: false })
  })

  it("reads the grouping directive", () => {
    expect(parseToken("group:team")).toEqual({ kind: "group", raw: "group:team", key: "team" })
  })

  it("reads the sort directive and its direction", () => {
    expect(parseToken("sort:name")).toEqual({ kind: "sort", raw: "sort:name", key: "name", desc: false })
    expect(parseToken("sort:-created")).toMatchObject({ key: "created", desc: true })
  })

  it("lowercases keys so the grammar is case insensitive", () => {
    expect(parseToken("STATUS:failed")).toMatchObject({ key: "status" })
  })

  it("treats a quoted value containing a colon as text", () => {
    expect(parseToken('"ratio:high"')).toMatchObject({ kind: "text", text: "ratio:high" })
  })
})

describe("parse", () => {
  it("reads a whole query as one token per span", () => {
    expect(parse("payment status:failed group:team").map((token) => token.kind)).toEqual(["text", "field", "group"])
  })
})

describe("spanAt", () => {
  it("finds the token the caret sits inside", () => {
    expect(spanAt("status:failed name:pay", 4)?.raw).toBe("status:failed")
    expect(spanAt("status:failed name:pay", 22)?.raw).toBe("name:pay")
  })
})

describe("replaceSpan", () => {
  it("replaces the token under the caret and reports the new caret", () => {
    const span = spanAt("status:fa", 9)
    expect(replaceSpan("status:fa", span, "status:failed")).toEqual({ query: "status:failed", caret: 13 })
  })

  it("appends with a separating space when there is no span", () => {
    expect(replaceSpan("status:failed", null, "group:team")).toEqual({
      query: "status:failed group:team",
      caret: 24,
    })
  })
})

describe("removeToken", () => {
  it("drops the matching token and keeps the rest", () => {
    expect(removeToken("payment status:failed group:team", "status:failed")).toBe("payment group:team")
  })
})

describe("upsertDirective", () => {
  it("replaces an existing directive rather than repeating it", () => {
    expect(upsertDirective("sort:name payment", "sort", "-created")).toBe("payment sort:-created")
  })

  it("removes the directive when the value is cleared", () => {
    expect(upsertDirective("payment group:team", "group", null)).toBe("payment")
  })
})

describe("addValue", () => {
  it("adds a new field token when the key is absent", () => {
    expect(addValue("payment", "status", "failed")).toBe("payment status:failed")
  })

  it("appends to the existing key as an alternative value", () => {
    expect(addValue("status:failed", "status", "stopped")).toBe("status:failed,stopped")
  })

  it("leaves the query untouched when the value is already there", () => {
    expect(addValue("status:failed", "status", "failed")).toBe("status:failed")
  })

  it("quotes a value that would otherwise split into two tokens", () => {
    expect(addValue("", "name", "order gateway")).toBe('name:"order gateway"')
  })

  it("writes a negated token when asked", () => {
    expect(addValue("", "status", "failed", true)).toBe("-status:failed")
  })
})
