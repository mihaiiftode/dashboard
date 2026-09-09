import {
  columnGroupingFeature,
  createExpandedRowModel,
  createGroupedRowModel,
  rowExpandingFeature,
  rowSortingFeature,
  tableFeatures as defineTableFeatures,
} from "@tanstack/react-table"

export const tableFeatures = defineTableFeatures({
  rowSortingFeature,
  columnGroupingFeature,
  rowExpandingFeature,
  groupedRowModel: createGroupedRowModel(),
  expandedRowModel: createExpandedRowModel(),
})
