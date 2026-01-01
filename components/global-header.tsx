"use client"

import Link from "next/link"
import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { BookOpen, Mic, Upload, Settings, Library, FileText, BrainCircuit, MessageSquare, Menu } from "lucide-react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { LanguageSwitcher } from "./language-switcher"
import { UILanguageSwitcher } from "./ui-language-switcher"
import { UserMenu } from "./user-menu"

export function GlobalHeader() {
  const t = useTranslations('Navigation')
  const pathname = usePathname()
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
                      <BookOpen className="h-4 w-4" />
                    </div>
                    ReadAI
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
            <div className="bg-primary text-primary-foreground p-1.5 md:p-2 rounded-lg md:rounded-xl shadow-sm hidden md:block">
              <BookOpen className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <span className="tracking-tight">ReadAI</span>
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
