import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Demo Account",
            credentials: {
                email: { label: "Email", type: "email", placeholder: "demo@example.com" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                // Mock authentication for demo purposes
                if (
                    credentials?.email === "demo@example.com" &&
                    credentials?.password === "password"
                ) {
                    return {
                        id: "1",
                        name: "Demo User",
                        email: "demo@example.com",
                        image: "https://github.com/shadcn.png",
                    }
                }
                return null
            },
        }),
    ],
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
    },
}
