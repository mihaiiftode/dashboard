import { render, type RenderOptions } from "@testing-library/react"
import { ThemeProvider } from "next-themes"
import type { ReactElement, ReactNode } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"

const Providers = ({ children }: { children: ReactNode }) => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <TooltipProvider>{children}</TooltipProvider>
  </ThemeProvider>
)

export const renderWithProviders = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  render(ui, { wrapper: Providers, ...options })
