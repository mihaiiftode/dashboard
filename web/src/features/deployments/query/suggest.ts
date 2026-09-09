import { quoteIfNeeded, spanAt, type Span } from "./grammar"
import { DELETED_SCOPE } from "./resolve"
import { groupCandidates, resolveKey, type Field, type FieldKind, type Schema } from "./schema"
import { coveredBy, topValues, type ValueIndex } from "./value-index"

export type SuggestionKind = "key" | "value" | "anywhere" | "directive"

export type Suggestion = {
  id: string
  kind: SuggestionKind
  label: string
  detail?: string
  count?: number
  insert: string
}

export type SuggestContext = {
  index: ValueIndex
  deletedRows: number
}

export type Suggestions = { span: Span | null; items: Suggestion[]; preselect: boolean }

const DIRECTIVE_DETAIL: Record<string, string> = {
  group: "group rows by a column",
  sort: "order rows, prefix - for desc",
  has: "rows that carry an attribute",
  is: "is:deleted shows the trash",
}
const DIRECTIVE_KEYS = Object.keys(DIRECTIVE_DETAIL)
const AGES = ["<24h", "<7d", "<30d", ">30d", ">90d"]
const VALUE_LIMIT = 12
const INDEXED_KINDS = new Set<FieldKind>(["enum", "string"])

type Cursor = {
  span: Span | null
  raw: string
  prefix: string
  body: string
  key: string | null
  rest: string
  partial: string
  comparator: string
  chosen: string[]
}

export const suggest = (query: string, caret: number, schema: Schema, context: SuggestContext): Suggestions => {
  const cursor = cursorAt(query, caret)
  const items = itemsFor(cursor, schema, context)
  return { span: cursor.span, items, preselect: items.length > 0 && items[0].kind !== "anywhere" }
}

export const indexFieldAt = (query: string, caret: number, schema: Schema): Field | null => {
  const { key } = cursorAt(query, caret)
  if (key === null || DIRECTIVE_KEYS.includes(key)) return null
  const field = resolveKey(schema, key)
  return field && INDEXED_KINDS.has(field.kind) ? field : null
}

const cursorAt = (query: string, caret: number): Cursor => {
  const span = spanAt(query, caret)
  const raw = span?.raw ?? ""
  const prefix = raw.startsWith("-") ? "-" : ""
  const body = raw.slice(prefix.length)
  const colon = body.indexOf(":")
  if (colon === -1)
    return { span, raw, prefix, body, key: null, rest: "", partial: body.toLowerCase(), comparator: "", chosen: [] }
  const rest = body.slice(colon + 1)
  const parts = rest.split(",")
  const typed = parts.at(-1) ?? ""
  const comparator = typed.startsWith("<") || typed.startsWith(">") ? typed.slice(0, 1) : ""
  return {
    span,
    raw,
    prefix,
    body,
    key: body.slice(0, colon).toLowerCase(),
    rest,
    partial: typed.slice(comparator.length).toLowerCase(),
    comparator,
    chosen: parts.slice(0, -1),
  }
}

const itemsFor = (cursor: Cursor, schema: Schema, context: SuggestContext): Suggestion[] => {
  if (cursor.key === null) return keyItems(cursor, schema)
  if (cursor.key === "group") return directiveItems(cursor, groupCandidates(schema))
  if (cursor.key === "sort") return directiveItems(cursor, schema.fields)
  if (cursor.key === "is") return scopeItems(cursor, context)
  if (cursor.key === "has") return presenceItems(cursor, schema)
  const field = resolveKey(schema, cursor.key)
  if (!field) return []
  if (field.kind === "date") return ageItems(cursor, field)
  return valueItems(cursor, field, context.index)
}

const keyItems = (cursor: Cursor, schema: Schema): Suggestion[] => {
  const keys = [...schema.fields.map((field) => field.key), ...DIRECTIVE_KEYS].filter((key) =>
    key.startsWith(cursor.partial),
  )
  const items = keys.map<Suggestion>((key) => {
    const field = schema.byKey.get(key)
    return {
      id: `key:${key}`,
      kind: DIRECTIVE_KEYS.includes(key) ? "directive" : "key",
      label: `${cursor.prefix}${key}:`,
      detail: DIRECTIVE_DETAIL[key] ?? (field?.attribute ? "attribute" : field?.kind),
      count: field?.attribute ? schema.attributeCounts.get(key) : undefined,
      insert: `${cursor.prefix}${key}:`,
    }
  })
  if (cursor.body === "") return items
  return [
    ...items,
    { id: "anywhere:text", kind: "anywhere", label: `“${cursor.body}”`, detail: "match anywhere", insert: cursor.raw },
  ]
}

const directiveItems = (cursor: Cursor, fields: readonly Field[]): Suggestion[] => {
  const desc = cursor.rest.startsWith("-")
  const wanted = desc ? cursor.partial.slice(1) : cursor.partial
  const sign = desc ? "-" : ""
  return fields
    .filter((field) => field.key.startsWith(wanted))
    .map((field) => ({
      id: `${cursor.key}:${field.key}`,
      kind: "directive",
      label: `${cursor.key}:${sign}${field.key}`,
      detail: field.attribute ? "attribute" : field.label,
      insert: `${cursor.key}:${sign}${field.key} `,
    }))
}

const scopeItems = (cursor: Cursor, context: SuggestContext): Suggestion[] => {
  if (!DELETED_SCOPE.startsWith(cursor.partial)) return []
  return [
    {
      id: "is:deleted",
      kind: "value",
      label: `${cursor.prefix}is:${DELETED_SCOPE}`,
      detail: "recoverable for 30 days",
      count: context.deletedRows,
      insert: `${cursor.prefix}is:${DELETED_SCOPE} `,
    },
  ]
}

const presenceItems = (cursor: Cursor, schema: Schema): Suggestion[] =>
  schema.attributeKeys
    .filter((key) => key.startsWith(cursor.partial))
    .map((key) => ({
      id: `has:${key}`,
      kind: "value",
      label: `${cursor.prefix}has:${key}`,
      count: schema.attributeCounts.get(key),
      insert: `${cursor.prefix}has:${key} `,
    }))

const ageItems = (cursor: Cursor, field: Field): Suggestion[] =>
  AGES.filter((age) => age.startsWith(cursor.comparator) && age.slice(1).startsWith(cursor.partial)).map((age) => ({
    id: `${field.key}:${age}`,
    kind: "value",
    label: `${cursor.prefix}${field.key}:${age}`,
    detail: age.startsWith("<") ? "newer than" : "older than",
    insert: `${cursor.prefix}${field.key}:${age} `,
  }))

const valueItems = (cursor: Cursor, field: Field, index: ValueIndex): Suggestion[] => {
  const values = topValues(index, cursor.partial, VALUE_LIMIT, cursor.chosen).map<Suggestion>((entry) => ({
    id: `${field.key}:${entry.value}`,
    kind: "value",
    label: `${cursor.prefix}${field.key}:${quoteIfNeeded(entry.value)}`,
    count: entry.rows,
    insert: insertOf(cursor, field, quoteIfNeeded(entry.value)),
  }))
  if (field.kind === "enum") return values
  return [anywhereItem(cursor, field, index), ...values]
}

const anywhereItem = (cursor: Cursor, field: Field, index: ValueIndex): Suggestion => {
  const typed = cursor.rest.split(",").at(-1) ?? ""
  return {
    id: "anywhere:value",
    kind: "anywhere",
    label: `${cursor.prefix}${field.key}:${typed === "" ? "…" : quoteIfNeeded(typed)}`,
    detail: "matches anywhere",
    count: coveredBy(index, cursor.partial),
    insert: typed === "" ? `${cursor.prefix}${field.key}:` : insertOf(cursor, field, quoteIfNeeded(typed)),
  }
}

const insertOf = (cursor: Cursor, field: Field, value: string): string =>
  `${cursor.prefix}${field.key}:${[...cursor.chosen, value].join(",")} `
