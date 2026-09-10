"use client"

import type { ReactNode } from "react"
import { QueryInput, type QueryInputProps } from "./query-input"

type QueryBarProps = QueryInputProps & { children?: ReactNode }

export const QueryBar = ({ children, ...input }: QueryBarProps) => (
  <div data-slot="query-bar" className="flex items-start gap-2 border-b bg-background px-4 py-2">
    <div className="min-w-0 flex-1">
      <QueryInput {...input} />
    </div>
    {children}
  </div>
)
