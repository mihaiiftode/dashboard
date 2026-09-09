import type { Metadata, Viewport } from "next"
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { AppHeader } from "@/components/app-header"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const sans = Atkinson_Hyperlegible_Next({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  adjustFontFallback: false,
})

const mono = Atkinson_Hyperlegible_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  adjustFontFallback: false,
})

export const metadata: Metadata = {
  title: "Deployments",
  description: "Platform deployments dashboard",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#161a20" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex h-full min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
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
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
