"use client"

import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field as FormField, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Deployment } from "@/lib/types"
import { ValueChip } from "./value-chip"

const MAX_SHOWN = 2
const CHAR_BUDGET = 40

function packChips(entries: readonly (readonly [string, string])[]): number {
  let used = 0
  let n = 0
  for (const [k, v] of entries) {
    const cost = k.length + v.length + 4
    if (n > 0 && (n >= MAX_SHOWN || used + cost > CHAR_BUDGET)) break
    used += cost
    n++
  }
  return n
}
const KEY_RULE = /^[a-z0-9_-]{1,64}$/

function AttributeRow({ keyName, value, onSave }: { keyName: string; value: string; onSave: (next: string) => void }) {
  const [draft, setDraft] = useState(value)
  const id = `attr-${keyName}`
  return (
    <FormField className="gap-1">
      <div className="flex items-center gap-1">
        <FieldLabel htmlFor={id} className="w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
          {keyName}
        </FieldLabel>
        <Input
          id={id}
          value={draft}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== value && onSave(draft.trim())}
          onKeyDown={(e) => e.key === "Enter" && onSave(draft.trim())}
          className="h-7 font-mono text-xs"
        />
        <Button variant="ghost" size="icon-xs" aria-label={`Remove ${keyName}`} onClick={() => onSave("")}>
          <XIcon />
        </Button>
      </div>
    </FormField>
  )
}

function AttributesEditor({
  deployment,
  keys,
  onSet,
}: {
  deployment: Deployment
  keys: string[]
  onSet: (key: string, value: string) => void
}) {
  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const present = keys.filter((k) => deployment.attributes[k] !== undefined)
  const add = () => {
    const key = newKey.trim().toLowerCase()
    if (!KEY_RULE.test(key)) return setError("Key: 1–64 chars, a-z 0-9 _ -")
    if (!newValue.trim()) return setError("Value is required")
    onSet(key, newValue.trim())
    setNewKey("")
    setNewValue("")
    setError(null)
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="truncate font-mono text-xs font-medium">{deployment.attributes.name}</p>
      {present.length === 0 && <p className="text-xs text-muted-foreground">No extra attributes yet.</p>}
      {present.map((k) => (
        <AttributeRow key={k} keyName={k} value={deployment.attributes[k] ?? ""} onSave={(v) => onSet(k, v)} />
      ))}
      <FormField data-invalid={error !== null || undefined} className="gap-1 border-t pt-2">
        <div className="flex items-center gap-1">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toLowerCase())}
            placeholder="key…"
            aria-label="New attribute key"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error !== null}
            className="h-7 w-24 shrink-0 font-mono text-xs"
          />
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value…"
            aria-label="New attribute value"
            autoComplete="off"
            className="h-7 font-mono text-xs"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button variant="outline" size="icon-xs" aria-label="Add attribute" onClick={add}>
            <PlusIcon />
          </Button>
        </div>
        {error && <FieldError>{error}</FieldError>}
      </FormField>
    </div>
  )
}

export function AttributesCell({
  deployment,
  keys,
  readOnly,
  onSet,
}: {
  deployment: Deployment
  keys: string[]
  readOnly?: boolean
  onSet: (key: string, value: string) => void
}) {
  const entries = keys
    .map((k) => [k, deployment.attributes[k]] as const)
    .filter((e): e is readonly [string, string] => e[1] !== undefined)
  const shownCount = packChips(entries)
  const shown = entries.slice(0, shownCount)
  const rest = entries.slice(shownCount)
  return (
    <Popover>
      <div className="flex w-full min-w-0 items-center gap-1">
        <PopoverTrigger
          render={
            <button
              type="button"
              disabled={readOnly}
              className="flex h-7 min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-sm px-1 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none aria-expanded:bg-muted"
              aria-label={`Edit attributes of ${deployment.attributes.name}`}
              title={readOnly ? undefined : "Click to edit attributes"}
            />
          }
        >
          {entries.length === 0 && <span className="text-muted-foreground/60">—</span>}
          {shown.map(([k, v]) => (
            <ValueChip key={k} keyName={k} value={v} showKey />
          ))}
          {rest.length > 0 && (
            <Badge
              variant="secondary"
              className="h-5 shrink-0 px-1.5 font-mono text-[11px]"
              title={rest.map(([k, v]) => `${k}: ${v}`).join("\n")}
            >
              +{rest.length}
            </Badge>
          )}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-3">
          <AttributesEditor deployment={deployment} keys={keys} onSet={onSet} />
        </PopoverContent>
      </div>
    </Popover>
  )
}
