"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen, Loader2 } from "lucide-react"
import { useLocale } from "next-intl"

export default function LoginPage() {
    const router = useRouter()
    const locale = useLocale()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const [isGitHubLoading, setIsGitHubLoading] = useState(false)
    const [error, setError] = useState("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError("")

        try {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            })

            if (result?.ok) {
                router.push("/library")
                router.refresh()
            } else {
                setError(locale === 'zh' ? "邮箱或密码错误" : "Invalid email or password")
            }
        } catch (error) {
            console.error(error)
            setError(locale === 'zh' ? "登录失败，请重试" : "Login failed, please try again")
        } finally {
            setIsLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
        setIsGoogleLoading(true)
        await signIn("google", { callbackUrl: "/library" })
    }

    const handleGitHubLogin = async () => {
        setIsGitHubLoading(true)
        await signIn("github", { callbackUrl: "/library" })
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
            <Card className="w-full max-w-md border-border/60 shadow-lg backdrop-blur-xl bg-background/60">
                <CardHeader className="space-y-1 items-center text-center">
                    <div className="bg-primary/10 p-3 rounded-full mb-2">
                        <BookOpen className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">
                        {locale === 'zh' ? '欢迎回来' : 'Welcome back'}
                    </CardTitle>
                    <CardDescription>
                        {locale === 'zh' ? '登录以访问您的书库' : 'Sign in to access your library'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* OAuth Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            onClick={handleGoogleLogin}
                            disabled={isGoogleLoading}
                            className="h-11"
                        >
                            {isGoogleLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                    Google
                                </>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleGitHubLogin}
                            disabled={isGitHubLoading}
                            className="h-11"
                        >
                            {isGitHubLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                    </svg>
                                    GitHub
                                </>
                            )}
                        </Button>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                {locale === 'zh' ? '或使用邮箱登录' : 'Or continue with email'}
                            </span>
                        </div>
                    </div>

                    {/* Email/Password Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">{locale === 'zh' ? '邮箱' : 'Email'}</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="your@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">{locale === 'zh' ? '密码' : 'Password'}</Label>
                                <Button variant="link" size="sm" className="px-0 font-normal h-auto text-xs">
                                    {locale === 'zh' ? '忘记密码？' : 'Forgot password?'}
                                </Button>
                            </div>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-destructive text-center">{error}</p>
                        )}

                        <Button type="submit" className="w-full h-11" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {locale === 'zh' ? '登录中...' : 'Signing in...'}
                                </>
                            ) : (
                                locale === 'zh' ? '登录' : 'Sign In'
                            )}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-center">
                    <p className="text-sm text-muted-foreground">
                        {locale === 'zh' ? '还没有账号？' : "Don't have an account?"}{' '}
                        <Button variant="link" size="sm" className="px-1 h-auto font-semibold">
                            {locale === 'zh' ? '立即注册' : 'Sign up'}
                        </Button>
                    </p>
                </CardFooter>
            </Card>
        </div>
    )
}

