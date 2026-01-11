"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Globe, ChevronDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
    useLanguageStore,
    UI_LANGUAGE_OPTIONS,
    TARGET_LANGUAGE_OPTIONS
} from "@/lib/stores/languageStore"
import type { UILanguage, TargetLanguage } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * UnifiedLanguageSelector
 * 
 * A combined language selector that shows BOTH:
 * 1. Interface Language (UI Language)
 * 2. Default Target Language (Translation Target)
 * 
 * Display format: "🌐 中文 · 翻译成简体中文"
 * 
 * ⚠️ KEY RULES:
 * - UI Language and Target Language are COMPLETELY DECOUPLED
 * - Changing UI Language does NOT auto-change Target Language
 * - Changing UI Language does NOT trigger re-translation
 */

export function UnifiedLanguageSelector() {
    const router = useRouter()
    const pathname = usePathname()
    const [open, setOpen] = useState(false)

    const {
        uiLanguage,
        defaultTargetLanguage,
        setUILanguage,
        setDefaultTargetLanguage,
        getDisplayName
    } = useLanguageStore()

    // Handle UI language change (also changes URL locale)
    const handleUILanguageChange = (lang: UILanguage) => {
        setUILanguage(lang)

        // Update URL locale
        const segments = pathname.split("/")
        if (segments[1] === "en" || segments[1] === "zh") {
            segments[1] = lang
            router.push(segments.join("/"))
        }
    }

    // Handle target language change
    const handleTargetLanguageChange = (lang: TargetLanguage) => {
        setDefaultTargetLanguage(lang)
        // Note: This does NOT trigger any re-translation
        // It only affects NEW books
    }

    // Get display text for button
    const uiLangName = getDisplayName(uiLanguage)
    const targetLangName = getDisplayName(defaultTargetLanguage)

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <Globe className="h-4 w-4" />
                    <span className="hidden sm:inline">
                        {uiLangName} · 翻译{targetLangName}
                    </span>
                    <span className="sm:hidden">
                        {uiLanguage.toUpperCase()}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
                {/* Interface Language Section */}
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    界面语言 / Interface
                </DropdownMenuLabel>
                <div className="p-1">
                    {UI_LANGUAGE_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => handleUILanguageChange(option.value)}
                            className={cn(
                                "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm",
                                "hover:bg-accent hover:text-accent-foreground",
                                "transition-colors cursor-pointer",
                                uiLanguage === option.value && "bg-accent/50"
                            )}
                        >
                            <span>{option.label}</span>
                            {uiLanguage === option.value && (
                                <Check className="h-4 w-4 text-primary" />
                            )}
                        </button>
                    ))}
                </div>

                <DropdownMenuSeparator />

                {/* Target Language Section */}
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    翻译目标语言 / Translate to
                </DropdownMenuLabel>
                <div className="p-1 max-h-48 overflow-y-auto">
                    {TARGET_LANGUAGE_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => handleTargetLanguageChange(option.value)}
                            className={cn(
                                "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm",
                                "hover:bg-accent hover:text-accent-foreground",
                                "transition-colors cursor-pointer",
                                defaultTargetLanguage === option.value && "bg-accent/50"
                            )}
                        >
                            <span>{option.label}</span>
                            {defaultTargetLanguage === option.value && (
                                <Check className="h-4 w-4 text-primary" />
                            )}
                        </button>
                    ))}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
