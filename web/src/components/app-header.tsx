import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"

export function AppHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b bg-card px-4">
      <Link href="/" className="font-mono text-sm font-medium tracking-wider uppercase">
        Deployments
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  )
}
