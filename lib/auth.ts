import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"

export const authOptions: NextAuthOptions = {
    providers: [
        // Google OAuth
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
        // Email/Password - for demo or manual registration
        CredentialsProvider({
            name: "Email",
            credentials: {
                email: { label: "Email", type: "email", placeholder: "your@email.com" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                // Demo account for testing
                if (
                    credentials?.email === "demo@example.com" &&
                    credentials?.password === "password"
                ) {
                    return {
                        id: "demo-1",
                        name: "Demo User",
                        email: "demo@example.com",
                        image: "https://github.com/shadcn.png",
                    }
                }

                // TODO: Add real user authentication with database
                // For now, allow any email/password combination for testing
                if (credentials?.email && credentials?.password && credentials.password.length >= 6) {
                    return {
                        id: `user-${Date.now()}`,
                        name: credentials.email.split('@')[0],
                        email: credentials.email,
                        image: null,
                    }
                }

                return null
            },
        }),
    ],
    pages: {
        signIn: "/login",
    },
    // Enable debug in development
    debug: process.env.NODE_ENV === 'development',
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        async jwt({ token, user, account }) {
            if (user) {
                token.id = user.id
                token.provider = account?.provider
            }
            return token
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).id = token.id;
                (session.user as any).provider = token.provider;
            }
            return session
        },
    },
}

