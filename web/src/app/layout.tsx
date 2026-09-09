import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { AppShell } from "@/components/shell/app-shell"
import "./globals.css"

const sans = localFont({
  src: "../fonts/atkinson-hyperlegible-next-latin.woff2",
  variable: "--font-sans",
  weight: "200 800",
  display: "swap",
  adjustFontFallback: "Arial",
})

const mono = localFont({
  src: "../fonts/atkinson-hyperlegible-mono-latin.woff2",
  variable: "--font-mono",
  weight: "200 800",
  display: "swap",
  adjustFontFallback: "Arial",
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
        <NuqsAdapter>
          <AppShell>{children}</AppShell>
        </NuqsAdapter>
      </body>
    </html>
  )
}
