"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { BottomControlBar } from "@/components/reader/bottom-control-bar"
import { RightSidePanel } from "@/components/reader/right-side-panel"
import { BlockComponent } from "@/components/reader/block-component"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ChevronRight, ChevronLeft } from "lucide-react"

// Mock Data
const mockBlocks = [
  {
    id: "1",
    text: "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.",
  },
  {
    id: "2",
    text: '"Whenever you feel like criticizing any one," he told me, "just remember that all the people in this world haven\'t had the advantages that you\'ve had."',
  },
  {
    id: "3",
    text: "He didn't say any more, but we've always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that.",
  },
]

export default function ReaderPage() {
  const params = useParams()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col relative bg-background">
          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto px-8 py-12">
              <div className="mb-12 text-center">
                <h1 className="text-3xl font-bold font-serif mb-2">The Great Gatsby</h1>
                <p className="text-muted-foreground">Chapter 1</p>
              </div>

              <div className="space-y-2">
                {mockBlocks.map((block, i) => (
                  <BlockComponent
                    key={block.id}
                    id={block.id}
                    originalText={block.text}
                    isActive={i === 1} // Demo active state
                    onPlay={(id) => console.log("Play", id)}
                    onTranslate={(id) => console.log("Translate", id)}
                  />
                ))}
                {/* More Lorem Ipsum for scrolling */}
                <div className="text-lg leading-relaxed text-muted-foreground/50 font-serif mt-8">
                  [More content follows...]
                </div>
              </div>
            </div>
          </ScrollArea>

          <Button
            variant="secondary"
            size="icon"
            className="absolute right-4 top-4 z-10 shadow-md md:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>

        {/* Sidebar */}
        <div className={`${sidebarOpen ? "block" : "hidden"} md:block border-l`}>
          <RightSidePanel />
        </div>
      </div>

      {/* Bottom Controls */}
      <BottomControlBar />
    </div>
  )
}
