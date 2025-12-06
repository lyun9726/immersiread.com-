"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { BookOpen, Mic, Upload, Settings, Library, FileText, BrainCircuit, MessageSquare, Menu } from "lucide-react"
import { usePathname } from "next/navigation"
import { LanguageSwitcher } from "./language-switcher"
import { UserMenu } from "./user-menu"

export function GlobalHeader() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  const navItems = [
    { href: "/library", label: "Library", icon: Library },
    { href: "/upload", label: "Upload", icon: Upload },
    { href: "/web-reader", label: "Web Reader", icon: BookOpen },
    { href: "/voices", label: "Voices", icon: Mic },
    { href: "/notes", label: "Notes", icon: FileText },
    { href: "/mindmap", label: "Mindmap", icon: BrainCircuit },
    { href: "/ask", label: "Ask AI", icon: MessageSquare },
  ]

  return (
    <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Mobile Menu Trigger */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-ml-2">
                  <Menu className="h-6 w-6" />
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
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <Link href="/" className="flex items-center gap-2.5 font-semibold text-xl transition-opacity hover:opacity-80">
            <div className="bg-primary text-primary-foreground p-2 rounded-xl shadow-sm hidden md:block">
              <BookOpen className="h-5 w-5" />
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

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/settings">
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
