import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "@/app/globals.css"
import { GlobalHeader } from "@/components/global-header"
import { GlobalFooter } from "@/components/global-footer"
import { GlobalModals } from "@/components/global-modals"
import { Toaster } from "@/components/ui/toaster"
import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"
import { notFound } from "next/navigation"
import { AuthProvider } from "@/components/auth-provider"
import { Analytics } from "@vercel/analytics/next"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "AI Reading Assistant",
  description: "Next-gen reading with AI, TTS, and translation.",
}

export default async function RootLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!["en", "zh"].includes(locale)) {
    notFound()
  }

  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background font-sans antialiased selection:bg-primary/10 flex flex-col`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <GlobalHeader />
            <main className="flex-1 flex flex-col">{children}</main>
            <GlobalFooter />
            <GlobalModals />
            <Toaster />
            <Analytics />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
