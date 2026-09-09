import { toast } from "@/components/ui/toast"
import { createLogger } from "@/lib/logger"

const log = createLogger("notify")

type Notice = {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

function show(type: "success" | "error" | "info" | "warning", notice: Notice) {
  return toast.add({
    type,
    title: notice.title,
    description: notice.description,
    actionProps: notice.action ? { children: notice.action.label, onClick: notice.action.onClick } : undefined,
  })
}

export const notify = {
  success: (notice: Notice) => show("success", notice),
  info: (notice: Notice) => show("info", notice),
  warning: (notice: Notice) => {
    log.warn("{title} {description}", { title: notice.title, description: notice.description ?? "" })
    return show("warning", notice)
  },
  error: (notice: Notice) => {
    log.error("{title} {description}", { title: notice.title, description: notice.description ?? "" })
    return show("error", notice)
  },
  dismiss: (id: string) => toast.close(id),
}
