import type { Metadata } from "next"
// import { Inter } from "next/font/google"
import "@/app/globals.css"
import { GlobalHeader } from "@/components/global-header"
import { GlobalFooter } from "@/components/global-footer"
import { GlobalModals } from "@/components/global-modals"
import { Toaster } from "@/components/ui/toaster"
import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"
import { notFound } from "next/navigation"
import { AuthProvider } from "@/components/auth-provider"
import { GlobalClientComponents } from "@/components/global-client-components"
import { Analytics } from "@vercel/analytics/next"

// const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "OmniRead - AI Translation, Reading & Listening Platform",
  description: "Read foreign content like your native language. One-stop AI translation, reading, and listening platform.",
  keywords: ["AI reading", "translation", "text-to-speech", "ebook reader", "language learning", "OmniRead", "通阅"],
  authors: [{ name: "OmniRead" }],
  creator: "OmniRead",
  publisher: "OmniRead",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://omniread.app",
    siteName: "OmniRead",
    title: "OmniRead - AI Translation, Reading & Listening Platform",
    description: "Read foreign content like your native language. One-stop AI translation, reading, and listening platform.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "OmniRead - 通阅",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OmniRead - AI Translation, Reading & Listening Platform",
    description: "Read foreign content like your native language.",
    images: ["/og-image.png"],
  },
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
      <body className={`min-h-screen bg-background font-sans antialiased selection:bg-primary/10 flex flex-col`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <GlobalHeader />
            <main className="flex-1 flex flex-col">{children}</main>
            <GlobalFooter />
            <GlobalModals />
            <Toaster />
            <Analytics />
            <GlobalClientComponents />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
