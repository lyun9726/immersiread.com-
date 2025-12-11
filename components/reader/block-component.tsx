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
  onPlay,
  onHighlight,
  onNote,
}: BlockProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Render content based on block type
  const limitLines = type === "list-item" || type === "blockquote" ? 20 : 6
  const renderContent = () => {
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
          "leading-tight text-foreground tracking-tight",
          sizeClasses[headingLevel as keyof typeof sizeClasses] || sizeClasses[1]
        )}>
          {originalText}
        </HeadingTag>
      )
    }

    if (type === "quote") {
      return (
        <blockquote className="border-l-4 border-primary pl-4 italic text-lg leading-relaxed text-foreground/90">
          {originalText}
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
    return (
      <p
        className="text-lg leading-relaxed text-foreground tracking-[-0.01em]"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {originalText}
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
    >
      {/* Action Toolbar - appears on hover */}
      <div
        className={cn(
          "absolute -top-3 right-6 flex gap-1 bg-background/95 backdrop-blur-sm shadow-lg border border-border/50 rounded-xl p-1.5 transition-all duration-200",
          isHovered || isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none",
        )}
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
      <div className="space-y-4">
        {renderContent()}

        {translation && (
          <div className="pt-3 border-t border-border/30">
            <p className="text-base leading-relaxed text-muted-foreground tracking-[-0.005em]">{translation}</p>
          </div>
        )}

        {note && (
          <div className="mt-3 p-3 bg-secondary/50 rounded-lg border border-border/40">
            <p className="text-sm text-foreground/90 italic">{note}</p>
          </div>
        )}
      </div>
    </div>
  )
}
