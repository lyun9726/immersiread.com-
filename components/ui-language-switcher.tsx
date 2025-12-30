"use client"

import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Globe, Check } from "lucide-react"

// UI locales that have complete translation files
const UI_LOCALES = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'zh', name: '简体中文', flag: '🇨🇳' },
];

export function UILanguageSwitcher() {
    const pathname = usePathname()
    const router = useRouter()

    // Get current locale from pathname
    const getCurrentLocale = () => {
        const segments = pathname.split('/')
        if (segments.length > 1) {
            const potentialLocale = segments[1]
            if (UI_LOCALES.some(l => l.code === potentialLocale)) {
                return potentialLocale
            }
        }
        return 'en' // default
    }

    const currentLocale = getCurrentLocale()
    const currentLang = UI_LOCALES.find(l => l.code === currentLocale) || UI_LOCALES[0]

    const handleLocaleChange = (newLocale: string) => {
        if (newLocale === currentLocale) return

        const segments = pathname.split('/')

        // Check if first segment after / is a known locale
        if (segments.length > 1 && UI_LOCALES.some(l => l.code === segments[1])) {
            segments[1] = newLocale
        } else {
            // Insert locale after first empty segment
            segments.splice(1, 0, newLocale)
        }

        const newPath = segments.join('/') || `/${newLocale}`
        router.replace(newPath)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 hover:bg-primary/10">
                    <Globe className="h-4 w-4" />
                    <span className="text-sm">{currentLang.flag}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
                {UI_LOCALES.map((locale) => (
                    <DropdownMenuItem
                        key={locale.code}
                        onClick={() => handleLocaleChange(locale.code)}
                        className="cursor-pointer"
                    >
                        <span className="mr-2">{locale.flag}</span>
                        <span className="flex-1">{locale.name}</span>
                        {currentLocale === locale.code && (
                            <Check className="h-4 w-4 text-primary" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
