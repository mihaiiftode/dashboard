import Link from "next/link"
import { ThemeToggle } from "./theme-toggle"

export const AppHeader = () => (
  <header className="flex h-12 shrink-0 items-center gap-4 border-b bg-card px-4">
    <Link
      href="/"
      className="rounded-sm font-mono text-sm font-medium tracking-wider uppercase focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      Deployments
    </Link>
    <div className="ml-auto flex items-center gap-2">
      <ThemeToggle />
    </div>
  </header>
)
