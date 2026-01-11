"use client"

import { useState } from "react"
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
    COMMON_LANGUAGES,
    ALL_LANGUAGES,
    type LanguageOption,
} from "@/lib/stores/languageStore"
import { useBookLanguageStore, useBookLanguage } from "@/lib/stores/bookLanguageStore"
import { cn } from "@/lib/utils"

/**
 * ReaderLanguageSelector
 * 
 * Language selector for use INSIDE the reader.
 * 
 * ⚠️ KEY RULES:
 * - Only affects CURRENT BOOK
 * - Does NOT update global defaultTargetLanguage
 * - Does NOT affect other books
 * - Only appears when in Translation or Bilingual mode
 */

interface ReaderLanguageSelectorProps {
    bookId: string
    className?: string
    variant?: "default" | "compact"
}

export function ReaderLanguageSelector({
    bookId,
    className,
    variant = "default"
}: ReaderLanguageSelectorProps) {
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    const { targetLanguage, setTargetLanguage } = useBookLanguage(bookId)
    const store = useBookLanguageStore()

    // Get display name for current language
    const currentLang = ALL_LANGUAGES.find(l => l.code === targetLanguage)
    const displayName = currentLang?.nativeName || targetLanguage

    // Handle language change (only affects this book!)
    const handleLanguageChange = (lang: string) => {
        setTargetLanguage(lang)
        setSearchQuery("")
        setOpen(false)
    }

    // Filter languages based on search
    const filteredLanguages = searchQuery
        ? ALL_LANGUAGES.filter(lang =>
            lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lang.code.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : null

    return (
        <DropdownMenu open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!isOpen) setSearchQuery("")
        }}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size={variant === "compact" ? "sm" : "default"}
                    className={cn(
                        "gap-1.5 text-muted-foreground hover:text-foreground",
                        className
                    )}
                >
                    <Globe className="h-4 w-4" />
                    <span className="text-xs">
                        翻译成：{displayName}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center justify-between">
                    <span>本书翻译目标 / This Book Only</span>
                    <span className="text-[10px] text-green-600 font-medium">✓ 仅影响当前书籍</span>
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
                        {filteredLanguages ? (
                            // Search results
                            filteredLanguages.length > 0 ? (
                                filteredLanguages.map((option) => (
                                    <LanguageItem
                                        key={option.code}
                                        option={option}
                                        isSelected={targetLanguage === option.code}
                                        onClick={() => handleLanguageChange(option.code)}
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
                                        isSelected={targetLanguage === option.code}
                                        onClick={() => handleLanguageChange(option.code)}
                                    />
                                ))}

                                <DropdownMenuSeparator className="my-2" />

                                {/* All Other Languages */}
                                <div className="text-[10px] text-muted-foreground px-2 py-1 font-medium">
                                    所有语言 / All Languages
                                </div>
                                {ALL_LANGUAGES.filter(l => !COMMON_LANGUAGES.find(c => c.code === l.code)).map((option) => (
                                    <LanguageItem
                                        key={option.code}
                                        option={option}
                                        isSelected={targetLanguage === option.code}
                                        onClick={() => handleLanguageChange(option.code)}
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
