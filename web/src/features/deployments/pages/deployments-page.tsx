"use client"

import { Transition } from "@/components/view-transition"
import { DeploymentsTable } from "../components/table/deployments-table"
import { FeatureBoundary } from "../components/feature-boundary"
import { FieldIndexRow } from "../components/field-index-row"
import { FieldsPanel } from "../components/fields-panel"
import { NoMatches } from "../components/no-matches"
import { QueryBar } from "../components/query-bar"
import { QueryChips } from "../components/query-chips"
import { TableSkeleton } from "../components/table-skeleton"
import { FieldsToggle } from "../components/view-controls"
import { QUERY_INPUT_ID, useDeploymentsView } from "../hooks/use-deployments-view"
import type { QueryChange } from "../hooks/use-deployment-query"
import type { Sorting } from "../query/sort"
import { useSlashFocus } from "../hooks/use-slash-focus"
import { useStoreBoundary } from "../hooks/use-store-boundary"

export type DeploymentsPageProps = {
  query: string
  onQueryChange: QueryChange
  group: string | null
  onGroupChange: (next: string | null) => void
  sort: Sorting
  onSortChange: (next: Sorting) => void
}

export const DeploymentsPage = (props: DeploymentsPageProps) => {
  const boundary = useStoreBoundary()
  return (
    <FeatureBoundary
      loading={boundary.loading}
      error={boundary.error}
      pending={
        <Transition exit="settle-out" default="none">
          <TableSkeleton />
        </Transition>
      }
      onRetry={boundary.onRetry}
    >
      {boundary.ready ? (
        <Transition enter="settle-in" default="none">
          <DeploymentsBrowser {...props} />
        </Transition>
      ) : null}
    </FeatureBoundary>
  )
}

const DeploymentsBrowser = (props: DeploymentsPageProps) => {
  const view = useDeploymentsView(props)
  useSlashFocus(QUERY_INPUT_ID)
  return (
    <>
      <QueryBar inputId={QUERY_INPUT_ID} {...view.editor}>
        <FieldsToggle open={view.fieldsOpen} onToggle={view.onToggleFields} />
      </QueryBar>
      <QueryChips chips={view.chips} onClear={view.onClearQuery} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view.matched.length === 0 ? (
            <NoMatches onClearQuery={view.onClearQuery} />
          ) : (
            <DeploymentsTable
              rows={view.matched}
              columns={view.columns}
              fields={view.fields}
              hasAttributesColumn={view.hasAttributesColumn}
              pendingIds={view.pendingIds}
              groupKey={view.group}
              sort={view.sort}
              onSortChange={view.onTableSortChange}
            />
          )}
        </div>
        {view.fieldsOpen ? (
          <Transition enter="panel-in" exit="panel-out" default="none">
            <FieldsPanel
              total={view.matched.length}
              search={view.fieldSearch}
              onSearchChange={view.onFieldSearchChange}
              onResetColumns={view.onResetColumns}
            >
              {view.listedFields.map((field) => (
                <FieldIndexRow
                  key={field.key}
                  field={field}
                  plan={view.appliedPlan}
                  catalog={view.catalog}
                  cutoff={view.cutoff}
                  search={view.fieldSearchTerm}
                  total={view.matched.length}
                  visible={view.visible.has(field.key)}
                  grouped={view.group === field.key}
                  onToggleColumn={() => view.onToggleColumn(field.key)}
                  onGroup={() => view.onGroupChange(view.group === field.key ? null : field.key)}
                  onFilter={(value) => view.onFilter(field.key, value)}
                />
              ))}
            </FieldsPanel>
          </Transition>
        ) : null}
      </div>
    </>
  )
}
