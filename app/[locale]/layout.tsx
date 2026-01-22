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
import { Analytics } from "@/components/analytics"
import { getBrandFromHeaders, BrandProvider } from "@/lib/brand"

// const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

// Dynamic metadata based on brand
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandFromHeaders()
  const isZh = false // Will be determined by locale in the page

  const title = brand.id === 'immersiread'
    ? "ImmersiRead - 沉浸式双语阅读平台"
    : "OmniRead - AI Translation, Reading & Listening Platform"

  const description = brand.id === 'immersiread'
    ? "沉浸式阅读是一款专业的双语阅读工具，支持EPUB、PDF翻译和TTS朗读。"
    : "Read foreign content like your native language. One-stop AI translation, reading, and listening platform."

  const siteName = brand.id === 'immersiread' ? 'ImmersiRead' : 'OmniRead'
  const siteUrl = `https://${brand.domain}`

  return {
    title,
    description,
    keywords: brand.id === 'immersiread'
      ? ["沉浸式阅读", "双语阅读", "EPUB翻译", "PDF翻译", "TTS朗读", "ImmersiRead"]
      : ["AI reading", "translation", "text-to-speech", "ebook reader", "language learning", "OmniRead", "通阅"],
    authors: [{ name: siteName }],
    creator: siteName,
    publisher: siteName,
    icons: {
      icon: `/brands/${brand.id}/icon.png`,
      apple: `/brands/${brand.id}/icon.png`,
    },
    // SEO Verification
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
      other: {
        "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || "",
      },
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: siteUrl,
      siteName,
      title,
      description,
      images: [
        {
          url: `/brands/${brand.id}/og-image.png`,
          width: 1200,
          height: 630,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/brands/${brand.id}/og-image.png`],
    },
  }
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
  const brand = await getBrandFromHeaders()

  // CSS custom properties for brand colors
  const brandStyles = {
    '--brand-primary': brand.colors.primary,
    '--brand-primary-foreground': brand.colors.primaryForeground,
    '--brand-accent': brand.colors.accent,
  } as React.CSSProperties

  return (
    <html lang={locale} suppressHydrationWarning style={brandStyles}>
      <body className={`min-h-screen bg-background font-sans antialiased selection:bg-primary/10 flex flex-col`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <BrandProvider brand={brand}>
              <GlobalHeader />
              <main className="flex-1 flex flex-col">{children}</main>
              <GlobalFooter />
              <GlobalModals />
              <Toaster />
              {/* Analytics: Google Analytics 4 + Microsoft Clarity */}
              <Analytics
                gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-7P4V7FYQJV"}
                clarityId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || "uzl4lgp8tv"}
              />
            </BrandProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
