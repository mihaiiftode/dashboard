"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import { notify } from "@/lib/notify"
import { compileQuery } from "../query/compile"
import type { Resolved } from "../query/apply"
import type { Schema } from "../query/schema"
import type { WriteConflict } from "./conflict"
import type { WriteRejection } from "./sync-tracker"
import { useDeploymentsCollection } from "./store-context"
import { useSyncStatus } from "./use-sync-status"
import type { Deployment } from "./schema"

export type DeploymentsAccess = {
  rows: Deployment[]
  pendingIds: ReadonlySet<string>
  setAttribute: (id: string, key: string, value: string) => void
  remove: (id: string) => void
  restore: (id: string) => void
  copyId: (id: string) => void
}

const RETENTION_NOTE = "Recoverable for 30 days under is:deleted."

export const useAllDeployments = (): Deployment[] => {
  const collection = useDeploymentsCollection()
  const { data } = useLiveQuery((query) => query.from({ deployment: collection }), [collection])
  return data
}

export const useMatchedDeployments = (state: Resolved, schema: Schema): Deployment[] => {
  const collection = useDeploymentsCollection()
  const { data } = useLiveQuery(
    (query) => compileQuery(query.from({ deployment: collection }), state, schema),
    [collection, state, schema],
  )
  return data as Deployment[]
}

export const useDeploymentWrites = (): Omit<DeploymentsAccess, "rows" | "pendingIds"> & {
  pendingIds: ReadonlySet<string>
} => {
  const collection = useDeploymentsCollection()
  const sync = useSyncStatus()
  useConflictNotice(sync.conflict)
  useRejectionNotice(sync.rejection)

  const setAttribute = useCallback(
    (id: string, key: string, value: string) => {
      if (key === "name" && !value) {
        notify.warning({
          title: "Name is required",
          description: "Type a name or press Escape to keep the current one.",
        })
        return
      }
      collection.update(id, (draft) => {
        if (value === "") delete draft.attributes[key]
        else draft.attributes[key] = value
      })
    },
    [collection],
  )

  const setDeletedAt = useCallback(
    (id: string, at: string | null) =>
      collection.update(id, (draft) => {
        draft.deleted_at = at
      }),
    [collection],
  )

  const remove = useCallback(
    (id: string) => {
      const target = collection.get(id)
      if (!target || target.deleted_at !== null) return
      setDeletedAt(id, new Date().toISOString())
      undoableNotice("info", `Deleted ${target.attributes.name}`, RETENTION_NOTE, () => setDeletedAt(id, null))
    },
    [collection, setDeletedAt],
  )

  const restore = useCallback(
    (id: string) => {
      const target = collection.get(id)
      if (!target || target.deleted_at === null) return
      const deletedAt = target.deleted_at
      undoableNotice("success", `Restored ${target.attributes.name}`, "Back in the deployments list, unchanged.", () =>
        setDeletedAt(id, deletedAt),
      )
      setDeletedAt(id, null)
    },
    [collection, setDeletedAt],
  )

  const copyId = useCallback((id: string) => {
    navigator.clipboard
      .writeText(id)
      .then(() => notify.success({ title: "Deployment ID copied" }))
      .catch(() => notify.error({ title: "Copy failed", description: `Select and copy it manually: ${id}` }))
  }, [])

  return useMemo(
    () => ({ pendingIds: sync.pendingIds, setAttribute, remove, restore, copyId }),
    [sync.pendingIds, setAttribute, remove, restore, copyId],
  )
}

const undoableNotice = (tone: "info" | "success", title: string, description: string, undo: () => void): void => {
  const emit = tone === "info" ? notify.info : notify.success
  const noticeId = emit({
    title,
    description,
    action: {
      label: "Undo",
      onClick: () => {
        notify.dismiss(noticeId)
        undo()
      },
    },
  })
}

const useConflictNotice = (conflict: WriteConflict | null): void => {
  const reported = useRef<WriteConflict | null>(null)
  useEffect(() => {
    if (conflict === null || reported.current === conflict) return
    reported.current = conflict
    const [first] = conflict.differences
    notify.warning({
      title: `${conflict.deployment.attributes.name} changed elsewhere`,
      description: `Kept ${first.key} ${first.winning} instead of ${first.attempted}.`,
    })
  }, [conflict])
}

const useRejectionNotice = (rejection: WriteRejection | null): void => {
  const reported = useRef<WriteRejection | null>(null)
  useEffect(() => {
    if (rejection === null || reported.current === rejection) return
    reported.current = rejection
    notify.error({
      title: `${rejection.deployment.attributes.name} was not saved`,
      description: rejection.detail,
    })
  }, [rejection])
}
