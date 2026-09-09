"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { SearchXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { notify } from "@/lib/notify"
import { buildDataset } from "@/lib/mock-data"
import { applyFilters, resolve, showsDeleted, sortRows } from "@/lib/query/apply"
import { addValue, parse, upsertDirective } from "@/lib/query/grammar"
import { buildSchema, defaultVisible } from "@/lib/query/schema"
import type { Deployment } from "@/lib/types"
import { DeploymentsTable, type Sort } from "./deployments-table"
import { FooterBar } from "./footer-bar"
import { FieldsPanel } from "./fields-panel"
import { QueryBar } from "./query-bar"
import { FieldsToggle } from "./view-controls"

const CONFLICT_MARKER = "conflict"
const SYNC_DELAY_MS = 700
const DEFAULT_SORT: Sort = { key: "created", desc: true }

export function DeploymentsView() {
  const params = useSearchParams()
  const [rows, setRows] = useState<Deployment[]>(() => buildDataset(5000))
  const [query, setQuery] = useState(() => params.get("q") ?? "")
  const [visible, setVisible] = useState<ReadonlySet<string>>(
    () => new Set(["name", "description", ...defaultVisible(buildSchema(rows))]),
  )
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [range, setRange] = useState({ start: 0, end: 0 })
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    const url = new URL(window.location.href)
    if (query) url.searchParams.set("q", query)
    else url.searchParams.delete("q")
    window.history.replaceState(null, "", url)
  }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable
      if (e.key === "/" && !typing) {
        e.preventDefault()
        document.getElementById("search")?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const schema = useMemo(() => buildSchema(rows), [rows])
  const resolved = useMemo(() => resolve(parse(query), schema), [query, schema])
  const sort = resolved.sort ?? DEFAULT_SORT
  const sorted = useMemo(() => sortRows(rows, sort, schema), [rows, sort, schema])
  const filtered = useMemo(() => applyFilters(sorted, resolved.filters, schema), [sorted, resolved.filters, schema])
  const deletedScope = showsDeleted(resolved.filters)
  const total = useMemo(
    () => rows.reduce((n, d) => n + ((d.deleted_at !== null) === deletedScope ? 1 : 0), 0),
    [rows, deletedScope],
  )
  const fields = useMemo(
    () => schema.fields.filter((f) => visible.has(f.key) || (f.key === "deleted" && deletedScope)),
    [schema, visible, deletedScope],
  )
  const hiddenAttributeKeys = useMemo(() => schema.attributeKeys.filter((k) => !visible.has(k)), [schema, visible])
  const onFilter = useCallback((key: string, value: string) => setQuery((q) => addValue(q, key, value)), [])
  const toggleColumn = useCallback((key: string, on?: boolean) => {
    setVisible((prev) => {
      const next = new Set(prev)
      const want = on ?? !next.has(key)
      if (want) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])
  const onSortChange = useCallback(
    (next: Sort) => setQuery((q) => upsertDirective(q, "sort", next ? `${next.desc ? "-" : ""}${next.key}` : null)),
    [],
  )

  const patch = useCallback((id: string, fn: (d: Deployment) => Deployment) => {
    setRows((prev) => prev.map((d) => (d.deployment_id === id ? fn(d) : d)))
  }, [])

  const markPending = useCallback((id: string, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const setAttribute = useCallback(
    (id: string, key: string, value: string) => {
      const before = rowsRef.current.find((d) => d.deployment_id === id)
      if (!before) return
      if (key === "name" && !value) {
        notify.error({
          title: "Name is required",
          description: "Type a name or press Escape to keep the current one.",
        })
        return
      }
      patch(id, (d) => {
        const attributes = { ...d.attributes }
        if (value === "") delete attributes[key]
        else attributes[key] = value
        return { ...d, attributes }
      })
      markPending(id, true)
      window.setTimeout(() => {
        markPending(id, false)
        if (value.toLowerCase().includes(CONFLICT_MARKER)) {
          const winning = before.attributes[key]
          patch(id, (d) => {
            const attributes = { ...d.attributes }
            if (winning === undefined) delete attributes[key]
            else attributes[key] = winning
            return { ...d, attributes }
          })
          notify.error({
            title: "Edit reverted",
            description: `A teammate saved “${winning ?? ""}” first. Re-apply if yours should win.`,
          })
        } else {
          patch(id, (d) => ({ ...d, updated_at: new Date().toISOString() }))
        }
      }, SYNC_DELAY_MS)
    },
    [patch, markPending],
  )

  const setDeletedAt = useCallback(
    (id: string, at: string | null) => patch(id, (d) => ({ ...d, deleted_at: at })),
    [patch],
  )

  const remove = useCallback(
    (id: string) => {
      const target = rowsRef.current.find((d) => d.deployment_id === id)
      if (!target || target.deleted_at !== null) return
      setDeletedAt(id, new Date().toISOString())
      const noticeId = notify.info({
        title: `Deleted ${target.attributes.name}`,
        description: "Recoverable for 30 days under is:deleted.",
        action: {
          label: "Undo",
          onClick: () => {
            notify.dismiss(noticeId)
            setDeletedAt(id, null)
          },
        },
      })
    },
    [setDeletedAt],
  )

  const restore = useCallback(
    (id: string) => {
      const target = rowsRef.current.find((d) => d.deployment_id === id)
      if (!target || target.deleted_at === null) return
      const deletedAt = target.deleted_at
      setDeletedAt(id, null)
      const noticeId = notify.success({
        title: `Restored ${target.attributes.name}`,
        description: "Back in the deployments list, unchanged.",
        action: {
          label: "Undo",
          onClick: () => {
            notify.dismiss(noticeId)
            setDeletedAt(id, deletedAt)
          },
        },
      })
    },
    [setDeletedAt],
  )

  const actions = useMemo(
    () => ({ pendingIds, onSetAttribute: setAttribute, onDelete: remove, onRestore: restore }),
    [pendingIds, setAttribute, remove, restore],
  )
  const onRangeChange = useCallback(
    (start: number, end: number) => setRange((r) => (r.start === start && r.end === end ? r : { start, end })),
    [],
  )

  return (
    <>
      <QueryBar
        query={query}
        onQueryChange={setQuery}
        rows={rows}
        schema={schema}
        invalid={resolved.invalid}
        trailing={<FieldsToggle open={fieldsOpen} onToggle={() => setFieldsOpen((v) => !v)} />}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {filtered.length === 0 ? (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchXIcon />
                </EmptyMedia>
                <EmptyTitle>No deployments match</EmptyTitle>
                <EmptyDescription>Loosen a token or clear the query.</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear query
              </Button>
            </Empty>
          ) : (
            <DeploymentsTable
              data={filtered}
              fields={fields}
              schema={schema}
              hiddenAttributeKeys={hiddenAttributeKeys}
              groupKey={resolved.group}
              sort={sort}
              onSortChange={onSortChange}
              actions={actions}
              onRangeChange={onRangeChange}
            />
          )}
        </div>
        {fieldsOpen && (
          <FieldsPanel
            schema={schema}
            rows={filtered}
            visible={visible}
            group={resolved.group}
            onToggleColumn={(key) => toggleColumn(key)}
            onGroup={(key) => setQuery((q) => upsertDirective(q, "group", key))}
            onFilter={onFilter}
            onResetColumns={() => setVisible(new Set(["name", "description", ...defaultVisible(schema)]))}
          />
        )}
      </div>
      <FooterBar start={range.start} end={range.end} matched={filtered.length} total={total} />
    </>
  )
}
