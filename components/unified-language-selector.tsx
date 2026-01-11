"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Globe, ChevronDown, Check, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    useLanguageStore,
    UI_LANGUAGE_OPTIONS,
    COMMON_LANGUAGES,
    ALL_LANGUAGES,
    LANGUAGE_METADATA,
    type LanguageOption,
} from "@/lib/stores/languageStore"
import type { UILanguage } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * UnifiedLanguageSelector
 * 
 * A combined language selector that shows BOTH:
 * 1. Interface Language (UI Language)
 * 2. Default Target Language (Translation Target) - 117 languages!
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
    const [searchQuery, setSearchQuery] = useState("")

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
    const handleTargetLanguageChange = (lang: string) => {
        setDefaultTargetLanguage(lang)
        setSearchQuery("") // Clear search after selection
        // Note: This does NOT trigger any re-translation
        // It only affects NEW books
    }

    // Filter languages based on search
    const filteredLanguages = searchQuery
        ? ALL_LANGUAGES.filter(lang =>
            lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lang.code.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : null

    // Get display text for button
    const uiLangName = getDisplayName(uiLanguage)
    const targetLangName = getDisplayName(defaultTargetLanguage)

    return (
        <DropdownMenu open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!isOpen) setSearchQuery("") // Clear search when closing
        }}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <Globe className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">
                        {uiLangName} · {targetLangName}
                    </span>
                    <span className="sm:hidden text-xs">
                        {uiLanguage.toUpperCase()}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-64">
                {/* Interface Language Section */}
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    界面语言 / Interface
                </DropdownMenuLabel>
                <div className="p-1">
                    {UI_LANGUAGE_OPTIONS.map((option) => (
                        <button
                            key={option.code}
                            onClick={() => handleUILanguageChange(option.code as UILanguage)}
                            className={cn(
                                "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm",
                                "hover:bg-accent hover:text-accent-foreground",
                                "transition-colors cursor-pointer",
                                uiLanguage === option.code && "bg-accent/50"
                            )}
                        >
                            <span>{option.nativeName}</span>
                            {uiLanguage === option.code && (
                                <Check className="h-4 w-4 text-primary" />
                            )}
                        </button>
                    ))}
                </div>

                <DropdownMenuSeparator />

                {/* Target Language Section */}
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center justify-between">
                    <span>翻译目标语言 / Translate to</span>
                    <span className="text-[10px] opacity-60">{LANGUAGE_METADATA.totalCount}+</span>
                </DropdownMenuLabel>

                {/* Search Input */}
                <div className="px-2 pb-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search languages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 pl-7 text-xs"
                        />
                    </div>
                </div>

                <ScrollArea className="h-64">
                    <div className="p-1">
                        {/* Show search results or grouped languages */}
                        {filteredLanguages ? (
                            // Search results
                            filteredLanguages.length > 0 ? (
                                filteredLanguages.map((option) => (
                                    <LanguageItem
                                        key={option.code}
                                        option={option}
                                        isSelected={defaultTargetLanguage === option.code}
                                        onClick={() => handleTargetLanguageChange(option.code)}
                                    />
                                ))
                            ) : (
                                <div className="text-xs text-muted-foreground text-center py-4">
                                    No languages found
                                </div>
                            )
                        ) : (
                            <>
                                {/* Common Languages */}
                                <div className="text-[10px] text-muted-foreground px-2 py-1 font-medium">
                                    常用语言 / Common
                                </div>
                                {COMMON_LANGUAGES.map((option) => (
                                    <LanguageItem
                                        key={option.code}
                                        option={option}
                                        isSelected={defaultTargetLanguage === option.code}
                                        onClick={() => handleTargetLanguageChange(option.code)}
                                    />
                                ))}

                                <DropdownMenuSeparator className="my-2" />

                                {/* All Other Languages */}
                                <div className="text-[10px] text-muted-foreground px-2 py-1 font-medium">
                                    所有语言 / All Languages
                                </div>
                                {ALL_LANGUAGES.filter(l => !COMMON_LANGUAGES.includes(l)).map((option) => (
                                    <LanguageItem
                                        key={option.code}
                                        option={option}
                                        isSelected={defaultTargetLanguage === option.code}
                                        onClick={() => handleTargetLanguageChange(option.code)}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                </ScrollArea>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// Language item component
function LanguageItem({
    option,
    isSelected,
    onClick
}: {
    option: LanguageOption
    isSelected: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm",
                "hover:bg-accent hover:text-accent-foreground",
                "transition-colors cursor-pointer",
                isSelected && "bg-accent/50"
            )}
        >
            <div className="flex flex-col items-start">
                <span className="text-sm">{option.nativeName}</span>
                <span className="text-[10px] text-muted-foreground">{option.name}</span>
            </div>
            {isSelected && (
                <Check className="h-4 w-4 text-primary flex-shrink-0" />
            )}
        </button>
    )
}
