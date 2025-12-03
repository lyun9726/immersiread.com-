import Link from "next/link"

export function GlobalFooter() {
  return (
    <footer className="border-t py-6 bg-muted/20 mt-auto">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
        <p>© 2025 ReadAI Assistant. All rights reserved.</p>
        <div className="flex gap-4">
          <Link href="#" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="#" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="#" className="hover:text-foreground">
            Help
          </Link>
        </div>
      </div>
    </footer>
  )
}
