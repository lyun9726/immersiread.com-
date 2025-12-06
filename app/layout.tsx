import type { ReactNode } from 'react';

// Since we have a `[locale]` layout, this root layout is only used 
// for the root not-found page or other non-locale routes.
export default function RootLayout({ children }: { children: ReactNode }) {
    return children;
}
