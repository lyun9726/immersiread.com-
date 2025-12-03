"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BookOpen, Mic, Upload, Settings, Library, FileText, BrainCircuit, MessageSquare } from "lucide-react"
import { usePathname } from "next/navigation"

export function GlobalHeader() {
  const pathname = usePathname()

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
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-xl transition-opacity hover:opacity-80">
          <div className="bg-primary text-primary-foreground p-2 rounded-xl shadow-sm">
            <BookOpen className="h-5 w-5" />
          </div>
          <span className="tracking-tight">ReadAI</span>
        </Link>

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
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <Settings className="h-5 w-5" />
              <span className="sr-only">Settings</span>
            </Button>
          </Link>
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 border border-border/50 overflow-hidden ring-2 ring-background shadow-sm">
            <img src="/diverse-user-avatars.png" alt="User" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </header>
  )
}
