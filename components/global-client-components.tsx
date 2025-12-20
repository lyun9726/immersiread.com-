"use client"

import { GlobalReadingIndicator } from "@/components/reader/global-reading-indicator"

/**
 * Client-side wrapper for global client components that need to be in the root layout.
 * This allows us to use client-side hooks in a server component layout.
 */
export function GlobalClientComponents() {
    return (
        <>
            <GlobalReadingIndicator />
        </>
    )
}
