import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function AskPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Ask AI</h1>
      <p className="text-muted-foreground mb-8">
        Chat with your entire library. Ask questions, get summaries, or find connections.
      </p>

      <div className="bg-muted/20 rounded-xl h-[500px] flex flex-col border">
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-muted-foreground">
          <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
          <p>Select a book or context to start chatting.</p>
        </div>
        <div className="p-4 bg-background border-t rounded-b-xl">
          <div className="flex gap-2">
            <Input placeholder="Ask a question..." />
            <Button>Send</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
