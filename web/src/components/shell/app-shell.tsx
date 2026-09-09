import type { ReactNode } from "react"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppHeader } from "./app-header"
import { FooterStatusProvider, StatusFooter } from "./footer-status"

type AppShellProps = {
  children: ReactNode
}

export const AppShell = ({ children }: AppShellProps) => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <TooltipProvider>
      <FooterStatusProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-[3px] focus:ring-ring/50"
        >
          Skip to content
        </a>
        <AppHeader />
        <main id="main" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
        <StatusFooter />
        <Toaster />
      </FooterStatusProvider>
    </TooltipProvider>
  </ThemeProvider>
)
