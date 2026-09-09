import { render, type RenderOptions } from "@testing-library/react"
import { ThemeProvider } from "next-themes"
import type { ReactElement, ReactNode } from "react"
import { FooterStatusProvider } from "@/components/shell/footer-status"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createFakeDeploymentsApi, type FakeDeploymentsApi } from "@/features/deployments/store/fake-api"
import { DeploymentsStoreProvider } from "@/features/deployments/store/store-context"
import type { Deployment } from "@/features/deployments/store/schema"
import { deployments } from "./deployments"

export const DEFAULT_ROW_COUNT = 60

export type ProviderOptions = Omit<RenderOptions, "wrapper"> & {
  rows?: Deployment[]
  api?: FakeDeploymentsApi
}

export const renderWithProviders = (ui: ReactElement, { rows, api, ...options }: ProviderOptions = {}) => {
  const store = api ?? createFakeDeploymentsApi(rows ?? deployments(DEFAULT_ROW_COUNT))
  const Providers = ({ children }: { children: ReactNode }) => (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <FooterStatusProvider>
          <DeploymentsStoreProvider api={store} databaseName={`spec-${crypto.randomUUID()}`}>
            {children}
          </DeploymentsStoreProvider>
        </FooterStatusProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
  return { api: store, ...render(ui, { wrapper: Providers, ...options }) }
}
