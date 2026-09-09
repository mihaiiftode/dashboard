"use client"

import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field as FormField, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { Deployment } from "@/lib/types"

const KEY_RULE = /^[a-z0-9_-]{1,64}$/

type AttributeRowProps = { keyName: string; value: string; onCommit: (next: string) => void }

const AttributeRow = ({ keyName, value, onCommit }: AttributeRowProps) => {
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
          onBlur={() => (draft.trim() === value ? undefined : onCommit(draft.trim()))}
          onKeyDown={(event) => (event.key === "Enter" ? onCommit(draft.trim()) : undefined)}
          className="h-7 font-mono text-xs"
        />
        <Button variant="ghost" size="icon-xs" aria-label={`Remove ${keyName}`} onClick={() => onCommit("")}>
          <XIcon />
        </Button>
      </div>
    </FormField>
  )
}

type AttributesEditorProps = {
  deployment: Deployment
  keys: string[]
  onCommit: (key: string, value: string) => void
}

export const AttributesEditor = ({ deployment, keys, onCommit }: AttributesEditorProps) => {
  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const present = keys.filter((k) => deployment.attributes[k] !== undefined)
  const add = () => {
    const key = newKey.trim().toLowerCase()
    if (!KEY_RULE.test(key)) return setError("Key: 1–64 chars, a-z 0-9 _ -")
    if (!newValue.trim()) return setError("Value is required")
    onCommit(key, newValue.trim())
    setNewKey("")
    setNewValue("")
    setError(null)
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="truncate font-mono text-xs font-medium">{deployment.attributes.name}</p>
      {present.length === 0 ? <p className="text-xs text-muted-foreground">No extra attributes yet.</p> : null}
      {present.map((k) => (
        <AttributeRow
          key={k}
          keyName={k}
          value={deployment.attributes[k] ?? ""}
          onCommit={(next) => onCommit(k, next)}
        />
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
            onKeyDown={(event) => (event.key === "Enter" ? add() : undefined)}
          />
          <Button variant="outline" size="icon-xs" aria-label="Add attribute" onClick={add}>
            <PlusIcon />
          </Button>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
      </FormField>
    </div>
  )
}
