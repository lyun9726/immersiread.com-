"use client"

import { usePathname, useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Languages } from "lucide-react"

export function LanguageSwitcher() {
    const pathname = usePathname()
    const router = useRouter()
    const locale = useLocale()

    const handleLanguageChange = (newLocale: string) => {
        // Current path: /en/library -> /zh/library
        // Or if path is /library (and rewritten), handled by middleware
        // Simple replacement strategy:

        // Split path into segments
        const segments = pathname.split('/')

        // Check if the second segment is a locale
        if (segments.length > 1 && ['en', 'zh'].includes(segments[1])) {
            segments[1] = newLocale;
        } else {
            // If no locale prefix (e.g. root or rewritten), prepend
            // Wait, middleware might handle / so usually we just map to /[locale]/...
            // Safer to rely on replacing the prefix if it exists, or prepending if strictly omitted?
            // Actually next-intl usually recommends using its own Link/router or manual path construction.
            // Let's do manual path construction for simplicity knowing our middleware structure.
            // If path /en/foo -> /zh/foo

            if (segments[1] === 'en' || segments[1] === 'zh') {
                segments[1] = newLocale;
            } else {
                // Should ideally not happen if middleware is "always" or "as-needed" with redirect,
                // but for safety:
                segments.splice(1, 0, newLocale);
            }
        }

        const newPath = segments.join('/')
        router.replace(newPath)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl">
                    <Languages className="h-5 w-5" />
                    <span className="sr-only">Switch Language</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleLanguageChange("en")}>
                    English
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleLanguageChange("zh")}>
                    简体中文
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
