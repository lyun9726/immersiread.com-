import { FileText, Search } from "lucide-react"
import { Input } from "@/components/ui/input"

export default function NotesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">My Notes</h1>

      <div className="flex gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search notes..." className="pl-9" />
        </div>
      </div>

      <div className="grid gap-4">
        <div className="p-12 text-center border-2 border-dashed rounded-lg text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No notes yet</h3>
          <p>Highlight text in any book to add notes.</p>
        </div>
      </div>
    </div>
  )
}
