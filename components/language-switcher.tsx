"use client"

import { useEffect, useState } from "react"
import { useReaderStore } from "@/lib/reader/stores/readerStore"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { Languages, Check, ChevronDown } from "lucide-react"
import { primaryLanguages, extendedLanguages, getLanguageByCode } from "@/data/target-languages"
import { ScrollArea } from "@/components/ui/scroll-area"

export function LanguageSwitcher() {
    const { targetLanguage, setTargetLanguage } = useReaderStore()
    const [mounted, setMounted] = useState(false)

    // Load saved language from localStorage on mount
    useEffect(() => {
        setMounted(true)
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('readai-target-language')
            if (saved && saved !== targetLanguage) {
                setTargetLanguage(saved)
            }
        }
    }, [])

    // Handle language change - only updates translation target (no UI locale switch for now)
    const handleLanguageChange = (langCode: string) => {
        setTargetLanguage(langCode)
        // Note: UI locale switching is disabled to avoid 404 errors
        // Translation will use the selected language
    }

    // Get current language display
    const currentLang = getLanguageByCode(targetLanguage)
    const displayName = currentLang ? currentLang.nativeName : targetLanguage

    if (!mounted) {
        return (
            <Button variant="ghost" size="sm" className="rounded-xl gap-2">
                <Languages className="h-4 w-4" />
                <span className="hidden sm:inline">Language</span>
            </Button>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-xl gap-2 hover:bg-primary/10">
                    <Languages className="h-4 w-4" />
                    <span className="hidden sm:inline text-sm font-medium">{displayName}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                    翻译目标语言 / Target Language
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Primary Languages */}
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-1">
                        常用 / Popular
                    </DropdownMenuLabel>
                    {primaryLanguages.map((lang) => (
                        <DropdownMenuItem
                            key={lang.code}
                            onClick={() => handleLanguageChange(lang.code)}
                            className="cursor-pointer"
                        >
                            <span className="mr-2">{lang.flag}</span>
                            <span className="flex-1">{lang.nativeName}</span>
                            {targetLanguage === lang.code && (
                                <Check className="h-4 w-4 text-primary" />
                            )}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                {/* Extended Languages in ScrollArea */}
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-1">
                        更多语言 / More Languages
                    </DropdownMenuLabel>
                    <ScrollArea className="h-[200px]">
                        {extendedLanguages.map((lang) => (
                            <DropdownMenuItem
                                key={lang.code}
                                onClick={() => handleLanguageChange(lang.code)}
                                className="cursor-pointer"
                            >
                                <span className="mr-2">{lang.flag}</span>
                                <span className="flex-1">{lang.nativeName}</span>
                                {targetLanguage === lang.code && (
                                    <Check className="h-4 w-4 text-primary" />
                                )}
                            </DropdownMenuItem>
                        ))}
                    </ScrollArea>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
