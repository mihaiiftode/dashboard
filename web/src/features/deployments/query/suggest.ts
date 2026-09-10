import { today } from "./dates"
import { resolveKey, FieldKind, type Field, type FieldCatalog } from "./fields"
import { quoteValue, DELETED_SCOPE, type Clause, type QueryDocument, type Span } from "./parse-query"
import { clauseAt } from "./query-edits"
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

export type SuggestContext = { index: ValueIndex; deletedRows: number; attributeCounts: ReadonlyMap<string, number> }

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
  query: QueryDocument,
  caret: number,
  catalog: FieldCatalog,
  context: SuggestContext,
  clause = clauseAt(query, caret),
): Suggestions => {
  if (query.diagnostics.some((issue) => issue.span === null)) return { span: null, items: [], preselect: false }
  const wrapper = clause ? query.source.slice(clause.span.start, clause.edit.start) : ""
  const items = itemsFor(clause, catalog, context).map((item) => labelled(item, wrapper))
  return { span: clause?.edit ?? null, items, preselect: items.length > 0 && items[0].kind !== ANYWHERE }
}

const labelled = (item: Suggestion, wrapper: string): Suggestion =>
  wrapper === "" ? item : { ...item, label: wrapper + item.label }

export const indexedFieldOf = (clause: Clause | null): Field | null =>
  clause?.field && INDEXED_KINDS.has(clause.field.kind) ? clause.field : null

const itemsFor = (clause: Clause | null, catalog: FieldCatalog, context: SuggestContext): Suggestion[] => {
  if (clause === null) return keyItems("", "", catalog, context.attributeCounts)
  if (clause.key === null) return keyItems(clause.partial, clause.editText, catalog, context.attributeCounts)
  if (clause.key === SCOPE_KEY) return scopeItems(clause, context)
  const field = resolveKey(catalog, clause.key)
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

const keyItems = (
  partial: string,
  text: string,
  catalog: FieldCatalog,
  attributeCounts: ReadonlyMap<string, number>,
): Suggestion[] => {
  const typed = partial.toLowerCase()
  const items = [...catalog.fields.map((field) => field.key), ...DIRECTIVE_KEYS]
    .filter((key) => key.startsWith(typed))
    .map<Suggestion>((key) => {
      const field = catalog.byKey.get(key)
      return {
        id: `key:${key}`,
        kind: DIRECTIVE_KEYS.includes(key) ? "directive" : "key",
        label: `${key}:`,
        detail: DIRECTIVE_DETAIL[key] ?? (field?.attribute ? "attribute" : field?.kind),
        count: field?.attribute ? attributeCounts.get(key) : undefined,
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
    insert: insertOf(field, quoteValue(entry.value), clause.comparator),
  }))

const anywhereItem = (clause: Clause, field: Field, index: ValueIndex): Suggestion => ({
  id: "anywhere:value",
  kind: "anywhere",
  label: `${field.key}:${clause.partial === "" ? "…" : quoteValue(clause.partial)}`,
  detail: "matches anywhere",
  count: coveredBy(index, clause.partial),
  insert: clause.partial === "" ? `${field.key}:` : insertOf(field, quoteValue(clause.partial), clause.comparator),
})

const insertOf = (field: Field, value: string, comparator: string): string => field.key + ":" + comparator + value + " "
