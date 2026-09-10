"use client"

import { useId } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { PlusIcon, XIcon } from "lucide-react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Field as FormField, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  attributeEntrySchema,
  attributeValueSchema,
  REQUIRED_ATTRIBUTE_KEYS,
  type Deployment,
} from "../../store/schema"

type AttributeRowProps = {
  keyName: string
  value: string
  removable: boolean
  onCommit: (next: string) => void
}

const AttributeRow = ({ keyName, value, removable, onCommit }: AttributeRowProps) => {
  const form = useForm({
    resolver: zodResolver(z.object({ value: attributeValueSchema(keyName) })),
    defaultValues: { value },
  })
  const commit = form.handleSubmit((entry) => {
    if (entry.value !== value) onCommit(entry.value)
  })
  const id = `${useId()}-${keyName}`
  return (
    <form onSubmit={commit}>
      <Controller
        name="value"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField data-invalid={fieldState.invalid || undefined} className="gap-1">
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor={id} className="w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                {keyName}
              </FieldLabel>
              <Input
                {...field}
                id={id}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={fieldState.invalid}
                onBlur={() => void commit()}
                className="h-7 font-mono text-xs"
              />
              {removable ? (
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${keyName}`} onClick={() => onCommit("")}>
                  <XIcon />
                </Button>
              ) : null}
            </div>
            {fieldState.invalid ? <FieldError>{`${keyName} ${fieldState.error?.message ?? ""}`}</FieldError> : null}
          </FormField>
        )}
      />
    </form>
  )
}

type AttributesEditorProps = {
  deployment: Deployment
  keys: string[]
  onCommit: (key: string, value: string) => void
}

export const AttributesEditor = ({ deployment, keys, onCommit }: AttributesEditorProps) => {
  const form = useForm({
    resolver: zodResolver(attributeEntrySchema),
    defaultValues: { key: "", value: "" },
  })
  const add = form.handleSubmit((entry) => {
    onCommit(entry.key, entry.value)
    form.reset()
  })
  const present = keys.filter((key) => deployment.attributes[key] !== undefined)
  const named = form.watch("key").trim()
  const violation = form.formState.errors.key ?? form.formState.errors.value
  return (
    <div className="flex flex-col gap-2">
      <p className="truncate font-mono text-xs font-medium">{deployment.attributes.name}</p>
      {present.length === 0 ? <p className="text-xs text-muted-foreground">No extra attributes yet.</p> : null}
      {present.map((key) => (
        <AttributeRow
          key={key}
          keyName={key}
          value={deployment.attributes[key] ?? ""}
          removable={!REQUIRED_ATTRIBUTE_KEYS.has(key)}
          onCommit={(next) => onCommit(key, next)}
        />
      ))}
      <form onSubmit={add}>
        <FormField data-invalid={violation !== undefined || undefined} className="gap-1 border-t pt-2">
          <div className="flex items-center gap-1">
            <Controller
              name="key"
              control={form.control}
              render={({ field }) => (
                <Input
                  {...field}
                  onChange={(event) => field.onChange(event.target.value.toLowerCase())}
                  placeholder="key…"
                  aria-label="New attribute key"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={violation !== undefined}
                  className="h-7 w-24 shrink-0 font-mono text-xs"
                />
              )}
            />
            <Controller
              name="value"
              control={form.control}
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder="value…"
                  aria-label="New attribute value"
                  autoComplete="off"
                  aria-invalid={violation !== undefined}
                  className="h-7 font-mono text-xs"
                />
              )}
            />
            <Button type="submit" variant="outline" size="icon-xs" aria-label="Add attribute">
              <PlusIcon />
            </Button>
          </div>
          {violation ? <FieldError>{`${named === "" ? "key" : named} ${violation.message ?? ""}`}</FieldError> : null}
        </FormField>
      </form>
    </div>
  )
}
