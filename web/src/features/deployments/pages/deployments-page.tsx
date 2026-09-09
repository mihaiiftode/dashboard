"use client"

import { DeploymentsTable } from "../components/table/deployments-table"
import { FeatureBoundary } from "../components/feature-boundary"
import { FieldIndexRow } from "../components/field-index-row"
import { FieldsPanel } from "../components/fields-panel"
import { NoMatches } from "../components/no-matches"
import { QueryBar } from "../components/query-bar"
import { TableSkeleton } from "../components/table-skeleton"
import { FieldsToggle } from "../components/view-controls"
import { QUERY_INPUT_ID, useDeploymentsView, type QueryChange } from "../hooks/use-deployments-view"
import { useSlashFocus } from "../hooks/use-slash-focus"
import { useStoreBoundary } from "../hooks/use-store-boundary"

export type DeploymentsPageProps = {
  query: string
  onQueryChange: QueryChange
}

export const DeploymentsPage = (props: DeploymentsPageProps) => {
  const boundary = useStoreBoundary()
  return (
    <FeatureBoundary
      loading={boundary.loading}
      error={boundary.error}
      pending={<TableSkeleton />}
      onRetry={boundary.onRetry}
    >
      {boundary.ready ? <DeploymentsBrowser {...props} /> : null}
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
        suggestions={view.suggestions}
        onQueryChange={onQueryChange}
        onCaretChange={view.onCaretChange}
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
            total={view.matched.length}
            search={view.fieldSearch}
            onSearchChange={view.onFieldSearchChange}
            onResetColumns={view.onResetColumns}
          >
            {view.listedFields.map((field) => (
              <FieldIndexRow
                key={field.key}
                field={field}
                filters={view.queryFilters}
                schema={view.schema}
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
        ) : null}
      </div>
    </>
  )
}
