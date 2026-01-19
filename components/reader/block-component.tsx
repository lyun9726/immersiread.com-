"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Play, FileEdit, Highlighter } from "lucide-react"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface BlockProps {
  id: string
  originalText: string
  translation?: string
  type?: "text" | "heading" | "image" | "code" | "quote" | "list-item" | "blockquote"
  headingLevel?: number
  isActive?: boolean
  highlightColor?: "yellow" | "green" | "blue" | "pink"
  note?: string
  readingMode?: "original" | "translation" | "bilingual"
  onPlay?: (id: string) => void
  onHighlight?: (id: string, color: "yellow" | "green" | "blue" | "pink") => void
  onNote?: (id: string) => void
}

export function BlockComponent({
  id,
  originalText,
  translation,
  type = "text",
  headingLevel = 1,
  isActive,
  highlightColor,
  note,
  readingMode = "original",
  currentWordIndex = -1,
  onPlay,
  onHighlight,
  onNote,
  onSentenceClick,
}: BlockProps & {
  currentWordIndex?: number
  onSentenceClick?: (id: string, offset: number) => void
}) {
  const [isHovered, setIsHovered] = useState(false)

  // Determine what text to show based on reading mode
  const showOriginal = readingMode === "original" || readingMode === "bilingual"
  const showTranslation = (readingMode === "translation" || readingMode === "bilingual") && translation

  // Helper to render text broken into clickable sentences
  const renderInteractiveText = (text: string, className: string, style?: React.CSSProperties) => {
    // If we have a playing word index, or if we want click-to-play functionality
    // We split into sentences using Intl.Segmenter if available, or simple regex
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'sentence' });
        const segments = Array.from(segmenter.segment(text));

        return (
          <p className={className} style={style}>
            {segments.map((segment, idx) => {
              const isPlaying = isActive &&
                currentWordIndex >= segment.index &&
                currentWordIndex < (segment.index + segment.segment.length)

              return (
                <span
                  key={idx}
                  className={cn(
                    "cursor-pointer hover:bg-primary/20 transition-colors rounded-sm px-0.5 -mx-0.5",
                    isPlaying && "bg-yellow-200 dark:bg-yellow-800/50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSentenceClick?.(id, segment.index);
                  }}
                >
                  {segment.segment}
                </span>
              )
            })}
          </p>
        )
      } catch (e) {
        console.warn("Intl.Segmenter failed, falling back to simple text", e)
      }
    }

    // Fallback: render whole text but allow click (start from 0)
    return (
      <p
        className={cn(className, "cursor-pointer hover:bg-primary/10")}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          onSentenceClick?.(id, 0);
        }}
      >
        {text}
      </p>
    )
  }

  // Render original content based on block type
  const renderOriginalContent = () => {
    if (type === "heading") {
      const HeadingTag = (headingLevel ? `h${Math.min(headingLevel, 6)}` : "p") as React.ElementType
      const sizeClasses = {
        1: "text-3xl font-bold",
        2: "text-2xl font-bold",
        3: "text-xl font-semibold",
        4: "text-lg font-semibold",
        5: "text-base font-semibold",
        6: "text-base font-medium",
      }
      return (
        <HeadingTag className={cn(
          "leading-tight text-foreground tracking-tight cursor-pointer hover:text-primary transition-colors",
          sizeClasses[headingLevel as keyof typeof sizeClasses] || sizeClasses[1]
        )}
          onClick={() => onSentenceClick?.(id, 0)}
        >
          {originalText}
        </HeadingTag>
      )
    }

    if (type === "quote") {
      return (
        <blockquote className="border-l-4 border-primary pl-4 italic text-lg leading-relaxed text-foreground/90">
          {renderInteractiveText(originalText, "")}
        </blockquote>
      )
    }

    if (type === "code") {
      return (
        <pre className="bg-secondary/50 p-4 rounded-lg overflow-x-auto">
          <code className="text-sm font-mono text-foreground">{originalText}</code>
        </pre>
      )
    }

    // Default text type
    return renderInteractiveText(
      originalText,
      "text-lg leading-relaxed text-foreground tracking-[-0.01em]",
      { fontFamily: "var(--font-sans)" }
    )
  }

  // Render translation content (immersive-translate style: blue text)
  const renderTranslationContent = () => {
    if (!translation) return null

    // For translation-only mode, use normal text color
    const textColorClass = readingMode === "translation"
      ? "text-foreground"
      : "text-blue-600 dark:text-blue-400"  // Immersive translate blue style

    if (type === "heading") {
      const HeadingTag = (headingLevel ? `h${Math.min(headingLevel, 6)}` : "p") as React.ElementType
      const sizeClasses = {
        1: "text-2xl font-bold",  // Slightly smaller than original
        2: "text-xl font-bold",
        3: "text-lg font-semibold",
        4: "text-base font-semibold",
        5: "text-sm font-semibold",
        6: "text-sm font-medium",
      }
      return (
        <HeadingTag className={cn(
          "leading-tight tracking-tight mt-2",
          textColorClass,
          sizeClasses[headingLevel as keyof typeof sizeClasses] || sizeClasses[1]
        )}>
          {translation}
        </HeadingTag>
      )
    }

    // Default text type translation
    return (
      <p
        className={cn(
          "text-base leading-relaxed tracking-[-0.01em] mt-2",
          textColorClass
        )}
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {translation}
      </p>
    )
  }

  return (
    <div
      id={`block-${id}`}
      className={cn(
        "group relative px-6 py-5 rounded-2xl transition-all duration-200 mb-6",
        highlightColor && `highlight-${highlightColor}`,
        isActive
          ? "bg-yellow-100/80 dark:bg-yellow-900/30 ring-2 ring-orange-500/50 shadow-lg transform scale-[1.02] z-10"
          : "hover:bg-muted/40 border-transparent",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        // Fallback click handler if not clicked on text
        // Don't trigger if already playing to avoid interruption? 
        // Or just let user click specific sentence.
      }}
    >
      {/* Action Toolbar - appears on hover */}
      <div
        className={cn(
          "absolute -top-3 right-6 flex gap-1 bg-background/95 backdrop-blur-sm shadow-lg border border-border/50 rounded-xl p-1.5 transition-all duration-200",
          isHovered || isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary"
          onClick={() => onPlay?.(id)}
          title="Play Block"
        >
          <Play className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary"
              title="Highlight"
            >
              <Highlighter className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem onClick={() => onHighlight?.(id, "yellow")} className="gap-2">
              <div className="h-4 w-4 rounded bg-[var(--highlight-yellow)] border" />
              Yellow
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onHighlight?.(id, "green")} className="gap-2">
              <div className="h-4 w-4 rounded bg-[var(--highlight-green)] border" />
              Green
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onHighlight?.(id, "blue")} className="gap-2">
              <div className="h-4 w-4 rounded bg-[var(--highlight-blue)] border" />
              Blue
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onHighlight?.(id, "pink")} className="gap-2">
              <div className="h-4 w-4 rounded bg-[var(--highlight-pink)] border" />
              Pink
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary",
            note && "text-primary bg-primary/5",
          )}
          onClick={() => onNote?.(id)}
          title="Add Note"
        >
          <FileEdit className="h-4 w-4" />
        </Button>
      </div>

      {/* Content with refined typography */}
      <div className="space-y-2">
        {/* Show original content (for original and bilingual modes) */}
        {showOriginal && renderOriginalContent()}

        {/* Show translation content (for translation and bilingual modes) */}
        {showTranslation && renderTranslationContent()}

        {note && (
          <div className="mt-3 p-3 bg-secondary/50 rounded-lg border border-border/40">
            <p className="text-sm text-foreground/90 italic">{note}</p>
          </div>
        )}
      </div>
    </div>
  )
}
