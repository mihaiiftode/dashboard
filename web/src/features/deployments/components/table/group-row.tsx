import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import { facetCell } from "../cells/facet-cell"
import type { Field } from "../../query/fields"

type GroupRowProps = {
  field: Field
  value: string
  count: number
  expanded: boolean
  onToggle: () => void
}

export const GroupRow = ({ field, value, count, expanded, onToggle }: GroupRowProps) => (
  <TableCell className="flex items-center gap-2 px-2" style={{ gridColumn: "1 / -1" }}>
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={onToggle}
      aria-label={expanded ? "Collapse group" : "Expand group"}
      aria-expanded={expanded}
    >
      {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
    </Button>
    <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{field.key}</span>
    {groupValue(field, value)}
    <Badge variant="ghost" className="font-mono tabular-nums">
      {count.toLocaleString()}
    </Badge>
  </TableCell>
)

const groupValue = (field: Field, value: string) => {
  if (value === "") return <span className="text-muted-foreground italic">no {field.key}</span>
  return facetCell(field.key, value) ?? <span className="font-mono text-sm">{value}</span>
}
