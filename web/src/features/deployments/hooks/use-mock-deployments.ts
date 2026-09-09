"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { buildDataset } from "@/lib/mock-data"
import { notify } from "@/lib/notify"
import type { Deployment } from "@/lib/types"

const SEED_ROWS = 5000
const CONFLICT_MARKER = "conflict"
const SYNC_DELAY_MS = 700
const RETENTION_NOTE = "Recoverable for 30 days under is:deleted."

export type DeploymentsStore = {
  rows: Deployment[]
  pendingIds: ReadonlySet<string>
  setAttribute: (id: string, key: string, value: string) => void
  remove: (id: string) => void
  restore: (id: string) => void
  copyId: (id: string) => void
}

export const useMockDeployments = (): DeploymentsStore => {
  const [rows, setRows] = useState<Deployment[]>(() => buildDataset(SEED_ROWS))
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set())
  const timers = useRef<Set<number>>(new Set())

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(window.clearTimeout)
  }, [])

  const patch = useCallback((id: string, apply: (deployment: Deployment) => Deployment) => {
    setRows((previous) => previous.map((row) => (row.deployment_id === id ? apply(row) : row)))
  }, [])

  const markPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((previous) => withMembership(previous, id, pending))
  }, [])

  const setAttribute = useCallback(
    (id: string, key: string, value: string) => {
      const before = rows.find((row) => row.deployment_id === id)
      if (!before) return
      if (key === "name" && !value) {
        notify.warning({
          title: "Name is required",
          description: "Type a name or press Escape to keep the current one.",
        })
        return
      }
      patch(id, (row) => withAttribute(row, key, value))
      markPending(id, true)
      const timer = window.setTimeout(() => {
        timers.current.delete(timer)
        markPending(id, false)
        if (!value.toLowerCase().includes(CONFLICT_MARKER)) {
          patch(id, (row) => ({ ...row, updated_at: new Date().toISOString() }))
          return
        }
        const winning = before.attributes[key]
        patch(id, (row) => withWinningAttribute(row, key, winning))
        notify.warning({
          title: "Edit reverted",
          description: `A teammate saved “${winning ?? ""}” first. Re-apply if yours should win.`,
        })
      }, SYNC_DELAY_MS)
      timers.current.add(timer)
    },
    [rows, patch, markPending],
  )

  const setDeletedAt = useCallback(
    (id: string, at: string | null) => patch(id, (row) => ({ ...row, deleted_at: at })),
    [patch],
  )

  const remove = useCallback(
    (id: string) => {
      const target = rows.find((row) => row.deployment_id === id)
      if (!target || target.deleted_at !== null) return
      setDeletedAt(id, new Date().toISOString())
      undoableNotice({ title: `Deleted ${target.attributes.name}`, description: RETENTION_NOTE, tone: "info" }, () =>
        setDeletedAt(id, null),
      )
    },
    [rows, setDeletedAt],
  )

  const restore = useCallback(
    (id: string) => {
      const target = rows.find((row) => row.deployment_id === id)
      if (!target || target.deleted_at === null) return
      const deletedAt = target.deleted_at
      setDeletedAt(id, null)
      undoableNotice(
        {
          title: `Restored ${target.attributes.name}`,
          description: "Back in the deployments list, unchanged.",
          tone: "success",
        },
        () => setDeletedAt(id, deletedAt),
      )
    },
    [rows, setDeletedAt],
  )

  const copyId = useCallback((id: string) => {
    navigator.clipboard
      .writeText(id)
      .then(() => notify.success({ title: "Deployment ID copied" }))
      .catch(() => notify.error({ title: "Copy failed", description: `Select and copy it manually: ${id}` }))
  }, [])

  return useMemo(
    () => ({ rows, pendingIds, setAttribute, remove, restore, copyId }),
    [rows, pendingIds, setAttribute, remove, restore, copyId],
  )
}

const withMembership = <T>(set: ReadonlySet<T>, member: T, present: boolean): ReadonlySet<T> => {
  const next = new Set(set)
  if (present) next.add(member)
  else next.delete(member)
  return next
}

const withAttribute = (deployment: Deployment, key: string, value: string): Deployment =>
  value === "" ? withoutAttribute(deployment, key) : withWinningAttribute(deployment, key, value)

const withWinningAttribute = (deployment: Deployment, key: string, value: string | undefined): Deployment =>
  value === undefined
    ? withoutAttribute(deployment, key)
    : { ...deployment, attributes: { ...deployment.attributes, [key]: value } }

const withoutAttribute = (deployment: Deployment, key: string): Deployment => {
  const attributes = { ...deployment.attributes }
  delete attributes[key]
  return { ...deployment, attributes }
}

type Notice = { title: string; description: string; tone: "info" | "success" }

const undoableNotice = (notice: Notice, undo: () => void) => {
  const emit = notice.tone === "info" ? notify.info : notify.success
  const noticeId = emit({
    title: notice.title,
    description: notice.description,
    action: {
      label: "Undo",
      onClick: () => {
        notify.dismiss(noticeId)
        undo()
      },
    },
  })
}
