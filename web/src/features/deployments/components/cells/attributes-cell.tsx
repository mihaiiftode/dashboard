"use client"

import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Deployment } from "../../store/schema"
import { ValueChip } from "../value-chip"
import { AttributesEditor } from "./attributes-editor"

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
type AttributesCellProps = {
  deployment: Deployment
  keys: string[]
  readOnly?: boolean
  onCommit: (key: string, value: string) => void
}

export const AttributesCell = ({ deployment, keys, readOnly, onCommit }: AttributesCellProps) => {
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
              data-slot="cell-editor"
            />
          }
        >
          {entries.length === 0 ? <span className="text-muted-foreground/60">—</span> : null}
          {shown.map(([k, v]) => (
            <ValueChip key={k} keyName={k} value={v} showKey />
          ))}
          {rest.length > 0 ? (
            <Badge
              variant="secondary"
              className="h-5 shrink-0 px-1.5 font-mono text-[11px]"
              title={rest.map(([k, v]) => `${k}: ${v}`).join("\n")}
            >
              +{rest.length}
            </Badge>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-3">
          <AttributesEditor deployment={deployment} keys={keys} onCommit={onCommit} />
        </PopoverContent>
      </div>
    </Popover>
  )
}
