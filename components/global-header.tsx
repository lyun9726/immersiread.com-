"use client"

import Link from "next/link"
import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { BookOpen, Mic, Upload, Settings, Library, FileText, BrainCircuit, MessageSquare, Menu } from "lucide-react"
import { usePathname } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { LanguageSwitcher } from "./language-switcher"
import { UILanguageSwitcher } from "./ui-language-switcher"
import { UserMenu } from "./user-menu"

// OmniRead Logo Component (Leaf/Page design)
function OmniReadLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className}>
      <path d="M6 4C6 2.89543 6.89543 2 8 2H24C25.1046 2 26 2.89543 26 4V28C26 29.1046 25.1046 30 24 30H8C6.89543 30 6 29.1046 6 28V4Z" opacity="0.2" />
      <path d="M8 4C8 3.44772 8.44772 3 9 3H23C23.5523 3 24 3.44772 24 4V28C24 28.5523 23.5523 29 23 29H9C8.44772 29 8 28.5523 8 28V4Z" />
      <path d="M11 8C11 7.44772 11.4477 7 12 7H20C20.5523 7 21 7.44772 21 8C21 8.55228 20.5523 9 20 9H12C11.4477 9 11 8.55228 11 8Z" fill="white" opacity="0.9" />
      <path d="M16 11C16.5523 11 17 11.4477 17 12V18.5858L18.2929 17.2929C18.6834 16.9024 19.3166 16.9024 19.7071 17.2929C20.0976 17.6834 20.0976 18.3166 19.7071 18.7071L16.7071 21.7071C16.3166 22.0976 15.6834 22.0976 15.2929 21.7071L12.2929 18.7071C11.9024 18.3166 11.9024 17.6834 12.2929 17.2929C12.6834 16.9024 13.3166 16.9024 13.7071 17.2929L15 18.5858V12C15 11.4477 15.4477 11 16 11Z" fill="white" opacity="0.9" />
    </svg>
  )
}

export function GlobalHeader() {
  const t = useTranslations('Navigation')
  const pathname = usePathname()
  const locale = useLocale()
  const brandName = locale === 'zh' ? '通阅' : 'OmniRead'
  const [isOpen, setIsOpen] = useState(false)

  // Check if we're on a reader page
  const isReaderPage = pathname?.includes('/reader/')

  // Auto-hide header on reader pages (mobile only)
  const [headerVisible, setHeaderVisible] = useState(true)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Start auto-hide timer for reader pages
  const startHideTimer = useCallback(() => {
    if (isReaderPage && typeof window !== 'undefined' && window.innerWidth < 768) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
      hideTimeoutRef.current = setTimeout(() => {
        setHeaderVisible(false)
      }, 3000)
    }
  }, [isReaderPage])

  // Show header and reset timer
  const showHeader = useCallback(() => {
    setHeaderVisible(true)
    startHideTimer()
  }, [startHideTimer])

  // Handle scroll to show header
  useEffect(() => {
    // Skip during SSR
    if (typeof window === 'undefined') return

    if (!isReaderPage) {
      setHeaderVisible(true)
      return
    }

    let lastScrollY = window.scrollY

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      // Show header when scrolling up or at top
      if (currentScrollY < lastScrollY || currentScrollY < 50) {
        showHeader()
      }
      lastScrollY = currentScrollY
    }

    // Start hide timer on mount for reader pages
    startHideTimer()

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [isReaderPage, showHeader, startHideTimer])

  const navItems = [
    { href: "/library", label: t('library'), icon: Library },
    { href: "/web-reader", label: t('webReader'), icon: BookOpen },
    { href: "/voices", label: t('voices'), icon: Mic },
    { href: "/podcast", label: t('podcast'), icon: Mic },
    { href: "/notes", label: t('notes'), icon: FileText },
    { href: "/mindmap", label: t('mindmap'), icon: BrainCircuit },
    { href: "/ask", label: t('ask'), icon: MessageSquare },
  ]

  return (
    <header
      className={`border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-50 shadow-sm transition-transform duration-300 ${isReaderPage && !headerVisible ? '-translate-y-full md:translate-y-0' : 'translate-y-0'
        }`}
      onMouseEnter={() => isReaderPage && setHeaderVisible(true)}
      onTouchStart={() => isReaderPage && showHeader()}
    >
      <div className="container mx-auto px-3 sm:px-6 h-12 md:h-16 flex items-center justify-between">
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Mobile Menu Trigger */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-ml-1 h-8 w-8">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[80%] sm:w-[350px] p-0">
                <SheetHeader className="p-6 border-b">
                  <SheetTitle className="flex items-center gap-2">
                    <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
                      <OmniReadLogo className="h-4 w-4" />
                    </div>
                    {brandName}
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col py-4">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-4 px-6 py-3 text-sm font-medium transition-colors hover:bg-muted ${pathname === item.href ? "bg-primary/10 text-primary border-r-2 border-primary" : "text-muted-foreground"
                        }`}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  ))}
                  {/* Settings link in mobile menu */}
                  <Link
                    href="/settings"
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-4 px-6 py-3 text-sm font-medium transition-colors hover:bg-muted ${pathname === '/settings' ? "bg-primary/10 text-primary border-r-2 border-primary" : "text-muted-foreground"
                      }`}
                  >
                    <Settings className="h-5 w-5" />
                    Settings
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <Link href="/" className="flex items-center gap-2 font-semibold text-lg md:text-xl transition-opacity hover:opacity-80">
            <div className="bg-primary text-primary-foreground p-1.5 md:p-2 rounded-lg md:rounded-xl shadow-sm">
              <OmniReadLogo className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <span className="tracking-tight">{brandName}</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={pathname === item.href ? "secondary" : "ghost"}
                size="sm"
                className="gap-2 rounded-lg font-medium transition-all"
              >
                <item.icon className="h-4 w-4" />
                <span className="text-sm">{item.label}</span>
              </Button>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 md:gap-2">
          <UILanguageSwitcher />
          <LanguageSwitcher />
          {/* Hide settings button on mobile - accessible via hamburger menu */}
          <Link href="/settings" className="hidden md:block">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <Settings className="h-5 w-5" />
              <span className="sr-only">Settings</span>
            </Button>
          </Link>

          <UserMenu />
        </div>
      </div>
    </header>
  )
}
