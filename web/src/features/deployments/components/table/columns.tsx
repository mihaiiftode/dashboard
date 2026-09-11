import { createColumnHelper } from "@tanstack/react-table"
import { TagIcon } from "lucide-react"
import { daysLeft } from "../../store/schema"
import type { Deployment } from "../../store/schema"
import { AttributesCell } from "../cells/attributes-cell"
import { ChipEditCell } from "../cells/chip-edit-cell"
import { facetCell } from "../cells/facet-cell"
import { IdCell } from "../cells/id-cell"
import { InlineEditCell } from "../cells/inline-edit-cell"
import { RowActionCell } from "../cells/row-action-cell"
import { TextCell } from "../cells/text-cell"
import { TimeCell } from "../cells/time-cell"
import { readFieldValue, type Field } from "../../query/fields"
import type { FieldStatistics } from "../../query/schema"
import { isChipField, optionsFor } from "./field-presentation"
import { tableFeatures } from "./features"

export { tableFeatures }

export type RowActions = {
  onSetAttribute: (id: string, key: string, value: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
  onCopyId: (id: string) => void
}

export type DeploymentsTableMeta = {
  pendingIds: ReadonlySet<string>
}

const pendingIn = (table: { options: { meta?: unknown } }, id: string): boolean =>
  ((table.options.meta as DeploymentsTableMeta | undefined)?.pendingIds ?? EMPTY).has(id)

const EMPTY: ReadonlySet<string> = new Set()

const helper = createColumnHelper<typeof tableFeatures, Deployment>()

const AttributeHeader = ({ label }: { label: string }) => (
  <span className="inline-flex items-center gap-1 font-mono normal-case">
    <TagIcon className="size-3 opacity-60" aria-hidden />
    {label}
  </span>
)

export type DeploymentColumns = ReturnType<typeof columnsFor>

export function columnsFor(
  statistics: FieldStatistics,
  fields: Field[],
  hiddenAttributeKeys: string[],
  actions: RowActions,
) {
  const valueColumns = fields.map((field) =>
    helper.accessor((deployment) => readFieldValue(field, deployment) ?? "", {
      id: field.key,
      header: () => (field.attribute ? <AttributeHeader label={field.key} /> : field.label),
      cell: ({ row, table }) =>
        renderValue(field, row.original, statistics, actions, pendingIn(table, row.original.deployment_id)),
    }),
  )
  const attributesColumn =
    hiddenAttributeKeys.length > 0
      ? [
          helper.display({
            id: "attributes",
            header: () => <AttributeHeader label="Attributes" />,
            cell: ({ row }) => (
              <AttributesCell
                deployment={row.original}
                keys={hiddenAttributeKeys}
                readOnly={row.original.deleted_at !== null}
                onCommit={(key, value) => actions.onSetAttribute(row.original.deployment_id, key, value)}
              />
            ),
          }),
        ]
      : []
  const actionsColumn = helper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <RowActionCell
        name={row.original.attributes.name}
        deleted={row.original.deleted_at !== null}
        onDelete={() => actions.onDelete(row.original.deployment_id)}
        onRestore={() => actions.onRestore(row.original.deployment_id)}
      />
    ),
  })
  return helper.columns([...valueColumns, ...attributesColumn, actionsColumn])
}

function renderValue(
  field: Field,
  deployment: Deployment,
  statistics: FieldStatistics,
  actions: RowActions,
  pending: boolean,
) {
  const readOnly = deployment.deleted_at !== null
  const commit = (next: string) => actions.onSetAttribute(deployment.deployment_id, field.key, next)
  switch (field.key) {
    case "id":
      return <IdCell value={deployment.deployment_id} onCopy={actions.onCopyId} />
    case "status":
    case "type":
    case "env":
      return facetCell(field.key, readFieldValue(field, deployment) ?? "")
    case "version":
      return <TextCell value={deployment.version} tabular />
    case "creator":
      return <TextCell value={deployment.created_by} muted truncate />
    case "created":
      return <TimeCell iso={deployment.created_at} />
    case "deleted":
      return deployment.deleted_at === null ? null : (
        <TimeCell iso={deployment.deleted_at} suffix={`${daysLeft(deployment.deleted_at)}d left`} />
      )
    default:
      return isChipField(statistics, field) ? (
        <ChipEditCell
          label={field.key}
          value={readFieldValue(field, deployment)}
          options={optionsFor(statistics, field.key)}
          pending={pending}
          readOnly={readOnly}
          onCommit={commit}
        />
      ) : (
        <InlineEditCell
          label={field.key}
          value={readFieldValue(field, deployment) ?? ""}
          placeholder="—"
          pending={pending}
          readOnly={readOnly}
          mono={field.key === "oncall"}
          muted={field.key !== "name"}
          options={field.key === "name" || field.key === "description" ? undefined : optionsFor(statistics, field.key)}
          onCommit={commit}
        />
      )
  }
}
