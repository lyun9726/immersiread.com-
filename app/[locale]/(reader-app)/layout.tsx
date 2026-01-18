import { GlobalClientComponents } from "@/components/global-client-components"

export default function ReaderAppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            {children}
            <GlobalClientComponents />
        </>
    )
}
