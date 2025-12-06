"use client"

import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { LogOut, User } from "lucide-react"

export function UserMenu() {
    const { data: session, status } = useSession()

    if (status === "loading") {
        return <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
    }

    if (!session) {
        return (
            <Link href="/login">
                <Button variant="default" size="sm" className="rounded-xl shadow-sm">
                    Login
                </Button>
            </Link>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 p-0 border border-border/50 overflow-hidden ring-2 ring-background shadow-sm">
                    <img
                        src={session.user?.image || "/diverse-user-avatars.png"}
                        alt={session.user?.name || "User"}
                        className="w-full h-full object-cover"
                    />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{session.user?.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{session.user?.email}</p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" /> Profile
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600 focus:text-red-600 cursor-pointer" onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
