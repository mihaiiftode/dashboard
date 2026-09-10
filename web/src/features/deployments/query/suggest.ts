import { today } from "./dates"
import { resolveKey, FieldKind, type Field } from "./fields"
import { clauseAt, quoteValue, DELETED_SCOPE, type Clause, type FilterSet, type Span } from "./filter-set"
import type { Schema } from "./schema"
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

export type SuggestContext = { index: ValueIndex; deletedRows: number }

export type Suggestions = { span: Span | null; items: Suggestion[]; preselect: boolean }

const SCOPE_KEY = "is"
const ANYWHERE: SuggestionKind = "anywhere"
const VALUE_LIMIT = 12

const DIRECTIVE_DETAIL: Record<string, string> = { [SCOPE_KEY]: "is:deleted shows the trash" }
const DIRECTIVE_KEYS = Object.keys(DIRECTIVE_DETAIL)
const DAY_DETAIL: Record<string, string> = {
  "": "on that day",
  "<": "before that day",
  ">": "after that day",
  "<=": "on or before that day",
  ">=": "on or after that day",
}

const INDEXED_KINDS = new Set<FieldKind>([FieldKind.Enum, FieldKind.String])

export const suggest = (
  query: FilterSet,
  caret: number,
  schema: Schema,
  context: SuggestContext,
  clause = clauseAt(query, caret),
): Suggestions => {
  if (query.syntaxIssue !== null) return { span: null, items: [], preselect: false }
  const items = itemsFor(clause, schema, context).map((item) => prefixed(item, clause?.prefix ?? ""))
  return { span: clause?.span ?? null, items, preselect: items.length > 0 && items[0].kind !== ANYWHERE }
}

const prefixed = (item: Suggestion, prefix: string): Suggestion =>
  prefix === "" ? item : { ...item, label: prefix + item.label, insert: prefix + item.insert }

export const indexedFieldOf = (clause: Clause | null): Field | null =>
  clause?.field && INDEXED_KINDS.has(clause.field.kind) ? clause.field : null

const itemsFor = (clause: Clause | null, schema: Schema, context: SuggestContext): Suggestion[] => {
  if (clause === null) return keyItems("", "", schema)
  if (clause.key === null) return keyItems(clause.partial, clause.text, schema)
  if (clause.key === SCOPE_KEY) return scopeItems(clause, context)
  const field = resolveKey(schema, clause.key)
  if (!field) return []
  return ITEMS_OF[field.kind](clause, field, context.index)
}

type KindItems = (clause: Clause, field: Field, index: ValueIndex) => Suggestion[]

const ITEMS_OF: Record<FieldKind, KindItems> = {
  [FieldKind.Date]: (clause, field) => dayItems(clause, field),
  [FieldKind.Enum]: (clause, field, index) => valueItems(clause, field, index),
  [FieldKind.String]: (clause, field, index) => [
    anywhereItem(clause, field, index),
    ...valueItems(clause, field, index),
  ],
  [FieldKind.Id]: (clause, field, index) => [anywhereItem(clause, field, index), ...valueItems(clause, field, index)],
}

const keyItems = (partial: string, text: string, schema: Schema): Suggestion[] => {
  const typed = partial.toLowerCase()
  const items = [...schema.fields.map((field) => field.key), ...DIRECTIVE_KEYS]
    .filter((key) => key.startsWith(typed))
    .map<Suggestion>((key) => {
      const field = schema.byKey.get(key)
      return {
        id: `key:${key}`,
        kind: DIRECTIVE_KEYS.includes(key) ? "directive" : "key",
        label: `${key}:`,
        detail: DIRECTIVE_DETAIL[key] ?? (field?.attribute ? "attribute" : field?.kind),
        count: field?.attribute ? schema.attributeCounts.get(key) : undefined,
        insert: `${key}:`,
      }
    })
  if (partial === "") return items
  return [
    ...items,
    { id: "anywhere:text", kind: "anywhere", label: `“${partial}”`, detail: "match anywhere", insert: text },
  ]
}

const scopeItems = (clause: Clause, context: SuggestContext): Suggestion[] => {
  if (!DELETED_SCOPE.startsWith(clause.partial.toLowerCase())) return []
  return [
    {
      id: "is:deleted",
      kind: "value",
      label: `is:${DELETED_SCOPE}`,
      detail: "recoverable for 30 days",
      count: context.deletedRows,
      insert: `is:${DELETED_SCOPE} `,
    },
  ]
}

const dayItems = (clause: Clause, field: Field): Suggestion[] => {
  const day = clause.partial === "" ? today() : clause.partial
  return Object.keys(DAY_DETAIL)
    .filter((comparator) => comparator.startsWith(clause.comparator))
    .map((comparator) => ({
      id: `${field.key}:${comparator}${day}`,
      kind: "value",
      label: `${field.key}:${comparator}${day}`,
      detail: DAY_DETAIL[comparator],
      insert: `${field.key}:${comparator}${day} `,
    }))
}

const valueItems = (clause: Clause, field: Field, index: ValueIndex): Suggestion[] =>
  topValues(index, clause.partial, VALUE_LIMIT).map<Suggestion>((entry) => ({
    id: `${field.key}:${entry.value}`,
    kind: "value",
    label: `${field.key}:${quoteValue(entry.value)}`,
    count: entry.rows,
    insert: insertOf(field, quoteValue(entry.value)),
  }))

const anywhereItem = (clause: Clause, field: Field, index: ValueIndex): Suggestion => ({
  id: "anywhere:value",
  kind: "anywhere",
  label: `${field.key}:${clause.partial === "" ? "…" : quoteValue(clause.partial)}`,
  detail: "matches anywhere",
  count: coveredBy(index, clause.partial),
  insert: clause.partial === "" ? `${field.key}:` : insertOf(field, quoteValue(clause.partial)),
})

const insertOf = (field: Field, value: string): string => field.key + ":" + value + " "
