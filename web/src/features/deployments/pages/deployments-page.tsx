"use client"

import { DeploymentsTable } from "../components/table/deployments-table"
import { FeatureBoundary } from "../components/feature-boundary"
import { FieldsPanel } from "../components/fields-panel"
import { NoMatches } from "../components/no-matches"
import { QueryBar } from "../components/query-bar"
import { TableSkeleton } from "../components/table-skeleton"
import { FieldsToggle } from "../components/view-controls"
import { QUERY_INPUT_ID, useDeploymentsView, type QueryChange } from "../hooks/use-deployments-view"
import { useSlashFocus } from "../hooks/use-slash-focus"
import { useDeploymentsStoreState } from "../store/store-context"

export type DeploymentsPageProps = {
  query: string
  onQueryChange: QueryChange
}

export const DeploymentsPage = (props: DeploymentsPageProps) => {
  const state = useDeploymentsStoreState()
  return (
    <FeatureBoundary
      loading={state.status === "loading"}
      error={state.status === "error" ? state.error : null}
      pending={<TableSkeleton />}
      onRetry={state.retry}
    >
      {state.status === "ready" ? <DeploymentsBrowser {...props} /> : null}
    </FeatureBoundary>
  )
}

const DeploymentsBrowser = ({ query, onQueryChange }: DeploymentsPageProps) => {
  const view = useDeploymentsView(query, onQueryChange)
  useSlashFocus(QUERY_INPUT_ID)
  return (
    <>
      <QueryBar
        inputId={QUERY_INPUT_ID}
        query={query}
        onQueryChange={onQueryChange}
        rows={view.rows}
        schema={view.schema}
        invalid={view.invalid}
        trailing={<FieldsToggle open={view.fieldsOpen} onToggle={view.onToggleFields} />}
      />
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
              onSortChange={view.onSortChange}
              onRangeChange={view.onRangeChange}
            />
          )}
        </div>
        {view.fieldsOpen ? (
          <FieldsPanel
            schema={view.schema}
            rows={view.matched}
            visible={view.visible}
            group={view.group}
            onToggleColumn={view.onToggleColumn}
            onGroup={view.onGroupChange}
            onFilter={view.onFilter}
            onResetColumns={view.onResetColumns}
          />
        ) : null}
      </div>
    </>
  )
}
