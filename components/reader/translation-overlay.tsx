"use client"

import { useEffect, useState } from "react"
import { useReaderStore } from "@/lib/reader/stores/readerStore"
import { Button } from "@/components/ui/button"
import { Loader2, X, Languages } from "lucide-react"

export function TranslationOverlay() {
    const selection = useReaderStore((state) => state.selection)
    const setSelection = useReaderStore((state) => state.setSelection)
    const setSelectionTranslation = useReaderStore((state) => state.setSelectionTranslation)
    const [loading, setLoading] = useState(false)

    // Clear selection on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setSelection(null)
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [setSelection])

    if (!selection) return null

    const handleTranslate = async () => {
        setLoading(true)
        try {
            // Mock API call for now (replace with real translation action)
            // await new Promise(resolve => setTimeout(resolve, 1000))
            // setSelectionTranslation("这是一个模拟的中文翻译结果。")

            const response = await fetch('/api/translate/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: [{ id: 'sel-1', text: selection.text }],
                    targetLang: 'zh'
                })
            })
            const data = await response.json()
            if (data.results && data.results.length > 0) {
                setSelectionTranslation(data.results[0].translated)
            }
        } catch (error) {
            console.error("Translation failed:", error)
        } finally {
            setLoading(false)
        }
    }

    // Calculate position (centered above selection)
    // Ensure it doesn't go off screen
    const { x, y, width = 0 } = selection.position
    const style: React.CSSProperties = {
        position: 'absolute',
        left: x + width / 2,
        top: y,
        transform: 'translate(-50%, -100%) translateY(-10px)',
        zIndex: 50
    }

    return (
        <div style={style} className="pointer-events-auto">
            <div className="bg-popover text-popover-foreground rounded-xl shadow-lg border border-border/50 p-3 w-80 max-w-[90vw] animate-in fade-in zoom-in-95 duration-200">
                {/* Selected Text Preview */}
                <div className="mb-3 max-h-32 overflow-y-auto custom-scrollbar">
                    <p className="text-sm text-muted-foreground italic border-l-2 border-primary/20 pl-2 leading-relaxed">
                        "{selection.text}"
                    </p>
                </div>

                {/* Translation Result */}
                {selection.translation && (
                    <div className="mb-3 p-3 bg-secondary/50 rounded-lg">
                        <p className="text-sm font-medium leading-relaxed">
                            {selection.translation}
                        </p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-between items-center gap-2">
                    <div className="flex gap-2">
                        {!selection.translation && (
                            <Button
                                size="sm"
                                className="h-8 rounded-lg text-xs"
                                onClick={handleTranslate}
                                disabled={loading}
                            >
                                {loading ? (
                                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Translating...</>
                                ) : (
                                    <><Languages className="h-3 w-3 mr-1" /> Translate</>
                                )}
                            </Button>
                        )}
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setSelection(null)}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            {/* Arrow */}
            <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-4 h-4 bg-popover border-r border-b border-border/50 rotate-45 shadow-sm transform translate-y-[-5px] z-[-1]" />
        </div>
    )
}
