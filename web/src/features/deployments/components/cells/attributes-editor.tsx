"use client"

import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field as FormField, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { entryViolation, valueViolation } from "../../store/attribute-rules"
import type { Deployment } from "../../store/schema"

const REQUIRED_KEY = "name"

type AttributeRowProps = {
  keyName: string
  value: string
  removable: boolean
  onCommit: (next: string) => void
}

const AttributeRow = ({ keyName, value, removable, onCommit }: AttributeRowProps) => {
  const [draft, setDraft] = useState(value)
  const [violation, setViolation] = useState<string | null>(null)
  const id = `attr-${keyName}`
  const commit = () => {
    const next = draft.trim()
    if (next === value) return setViolation(null)
    const reason = valueViolation(keyName, next)
    setViolation(reason)
    if (reason === null) onCommit(next)
  }
  return (
    <FormField data-invalid={violation !== null || undefined} className="gap-1">
      <div className="flex items-center gap-1">
        <FieldLabel htmlFor={id} className="w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
          {keyName}
        </FieldLabel>
        <Input
          id={id}
          value={draft}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={violation !== null}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => (event.key === "Enter" ? commit() : undefined)}
          className="h-7 font-mono text-xs"
        />
        {removable ? (
          <Button variant="ghost" size="icon-xs" aria-label={`Remove ${keyName}`} onClick={() => onCommit("")}>
            <XIcon />
          </Button>
        ) : null}
      </div>
      {violation ? <FieldError>{`${keyName} ${violation}`}</FieldError> : null}
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
  const [violation, setViolation] = useState<string | null>(null)
  const present = keys.filter((key) => deployment.attributes[key] !== undefined)
  const add = () => {
    const key = newKey.trim().toLowerCase()
    const reason = entryViolation(key, newValue)
    setViolation(reason)
    if (reason !== null) return
    onCommit(key, newValue.trim())
    setNewKey("")
    setNewValue("")
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="truncate font-mono text-xs font-medium">{deployment.attributes.name}</p>
      {present.length === 0 ? <p className="text-xs text-muted-foreground">No extra attributes yet.</p> : null}
      {present.map((key) => (
        <AttributeRow
          key={key}
          keyName={key}
          value={deployment.attributes[key] ?? ""}
          removable={key !== REQUIRED_KEY}
          onCommit={(next) => onCommit(key, next)}
        />
      ))}
      <FormField data-invalid={violation !== null || undefined} className="gap-1 border-t pt-2">
        <div className="flex items-center gap-1">
          <Input
            value={newKey}
            onChange={(event) => setNewKey(event.target.value.toLowerCase())}
            placeholder="key…"
            aria-label="New attribute key"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={violation !== null}
            className="h-7 w-24 shrink-0 font-mono text-xs"
          />
          <Input
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
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
        {violation ? <FieldError>{`${newKey.trim() === "" ? "key" : newKey.trim()} ${violation}`}</FieldError> : null}
      </FormField>
    </div>
  )
}
