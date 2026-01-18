"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, Upload, Sparkles, User, Headphones } from 'lucide-react'
import { useTranslations } from 'next-intl'

// Feature Bento Grid Component
function FeatureGrid() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-[minmax(180px,auto)]">
            {/* 1. Immersive Bilingual Reading (Large Card) */}
            <div className="md:col-span-2 md:row-span-2 relative group overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-100/50 dark:border-blue-800/30 p-8 flex flex-col justify-between hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-400">
                            <BookOpen className="w-6 h-6" />
                        </div>
                        <h3 className="text-2xl font-bold text-foreground">沉浸式双语阅读</h3>
                    </div>
                    <p className="text-muted-foreground text-lg max-w-md">
                        一段中文，一段英文。左右对照，或上下并列。像母语一样自然地阅读原版书籍。
                    </p>
                </div>

                {/* Mockup UI */}
                <div className="mt-8 relative md:absolute md:right-0 md:bottom-0 md:w-3/5 md:h-4/5 shadow-2xl rounded-tl-2xl bg-background border border-border/50 overflow-hidden transform md:translate-x-4 md:translate-y-4 md:group-hover:translate-x-2 md:group-hover:translate-y-2 transition-transform duration-500">
                    <div className="p-4 space-y-4 bg-white/50 dark:bg-black/20 backdrop-blur-sm h-full">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b pb-2 border-border/30">
                            <div className="w-20 h-2 bg-muted rounded-full" />
                            <div className="w-4 h-4 rounded-full bg-primary/20" />
                        </div>
                        {/* Content Lines */}
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <div className="w-full h-3 bg-foreground/10 rounded-full" />
                                <div className="w-5/6 h-3 bg-foreground/10 rounded-full" />
                                <div className="w-4/6 h-3 bg-foreground/10 rounded-full" />
                            </div>
                            <div className="space-y-2 pl-4 border-l-2 border-primary/30">
                                <div className="w-full h-3 bg-primary/10 rounded-full" />
                                <div className="w-11/12 h-3 bg-primary/10 rounded-full" />
                                <div className="w-3/4 h-3 bg-primary/10 rounded-full" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. AI Neural TTS (Tall Card) */}
            <div className="md:col-span-1 md:row-span-2 relative group overflow-hidden rounded-3xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-100/50 dark:border-purple-800/30 p-8 flex flex-col hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500">
                <div className="relative z-10 mb-auto">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-600 dark:text-purple-400">
                            <Headphones className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-bold text-foreground">AI 拟人伴读</h3>
                    </div>
                    <p className="text-muted-foreground">
                        微软 Azure 语音合成技术，情感丰富，媲美真人。
                    </p>
                </div>

                {/* Visualizer Animation */}
                <div className="mt-8 flex items-end justify-center gap-1.5 h-32 opacity-80">
                    {[40, 70, 50, 80, 60, 90, 40].map((h, i) => (
                        <div
                            key={i}
                            className="w-3 bg-gradient-to-t from-purple-500 to-pink-500 rounded-full animate-pulse"
                            style={{
                                height: `${h}%`,
                                animationDelay: `${i * 0.1}s`,
                                animationDuration: '1s'
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* 3. Smart Knowledge (Small Card) */}
            <div className="md:col-span-1 relative group overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-100/50 dark:border-amber-800/30 p-6 flex flex-col justify-center hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-500">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <h3 className="text-lg font-bold text-foreground">知识提炼</h3>
                        <p className="text-xs text-muted-foreground">AI 自动生成摘要与思维导图</p>
                    </div>
                    <div className="p-2 bg-amber-500/10 rounded-lg text-amber-600 dark:text-amber-400">
                        <Sparkles className="w-5 h-5" />
                    </div>
                </div>
            </div>

            {/* 4. Format Support (Small Card) */}
            <div className="md:col-span-1 relative group overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40 border border-emerald-100/50 dark:border-emerald-800/30 p-6 flex flex-col justify-center hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-500">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <h3 className="text-lg font-bold text-foreground">全格式支持</h3>
                        <p className="text-xs text-muted-foreground">PDF, EPUB, TXT, MOBI...</p>
                    </div>
                    <div className="flex -space-x-2">
                        <div className="w-8 h-8 rounded bg-white dark:bg-black/40 border shadow-sm flex items-center justify-center text-[8px] font-bold text-red-500 rotate-[-6deg]">PDF</div>
                        <div className="w-8 h-8 rounded bg-white dark:bg-black/40 border shadow-sm flex items-center justify-center text-[8px] font-bold text-blue-500 rotate-6">EPUB</div>
                    </div>
                </div>
            </div>

            {/* 5. Cloud Sync (Small Card) */}
            <div className="md:col-span-1 relative group overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-950/40 dark:to-sky-950/40 border border-cyan-100/50 dark:border-cyan-800/30 p-6 flex flex-col justify-center hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-500">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <h3 className="text-lg font-bold text-foreground">多端同步</h3>
                        <p className="text-xs text-muted-foreground">随时随地，无缝接续</p>
                    </div>
                    <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-600 dark:text-cyan-400">
                        <User className="w-5 h-5" />
                    </div>
                </div>
            </div>

        </div>
    )
}

export default function NewHomePage() {
    const t = useTranslations('Hero')
    console.log('Rendering NewHomePage')

    return (
        <div className="min-h-screen bg-background pb-20 selection:bg-primary/10 selection:text-primary overflow-hidden">
            {/* Test Banner */}
            <div className="bg-yellow-400 text-black font-bold text-center py-2 sticky top-0 z-[100]">
                Debug View: If you see this, the code is updated but cached on Home.
            </div>

            {/* Hero Section with Enhanced Aurora Background */}
            <section className="relative overflow-hidden py-12 sm:py-16 lg:py-20 border-b border-border/30">
                {/* Animated Mesh Gradient Background */}
                <div className="absolute inset-0 -z-10">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-background to-purple-50 dark:from-blue-950/30 dark:via-background dark:to-purple-950/30" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))]" />
                </div>

                {/* Floating Orbs - Enhanced */}
                <div className="absolute top-20 right-[10%] -z-10 h-[600px] w-[600px] bg-gradient-to-br from-blue-400/30 to-cyan-400/30 blur-[100px] rounded-full animate-pulse" />
                <div className="absolute -bottom-20 left-[5%] -z-10 h-[500px] w-[500px] bg-gradient-to-tr from-purple-400/25 to-pink-400/25 blur-[100px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 h-[800px] w-[800px] bg-gradient-to-r from-primary/10 to-violet-500/10 blur-[120px] rounded-full" />

                {/* Grid Pattern Overlay */}
                <div className="absolute inset-0 -z-5 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

                <div className="container mx-auto px-4 sm:px-6 relative z-10">
                    <div className="max-w-4xl mx-auto text-center">
                        {/* Main Headline - Single line style */}
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground mb-6 leading-[1.2]">
                            <span className="bg-gradient-to-r from-primary via-blue-500 to-purple-500 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
                                {t('title')}
                            </span>
                        </h1>

                        {/* Subtitle */}
                        <p className="text-xl sm:text-2xl text-foreground/80 mb-10 leading-relaxed max-w-2xl mx-auto font-medium">
                            {t('subtitle')}
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
                            <Link href="/library">
                                <Button size="lg" className="rounded-full px-10 h-14 text-base font-bold shadow-2xl shadow-primary/25 hover:shadow-primary/40 hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90">
                                    {t('goToLibrary')}
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                            <Link href="/upload">
                                <Button size="lg" variant="outline" className="rounded-full px-10 h-14 text-base font-bold bg-background/60 backdrop-blur-xl border-2 border-border/50 hover:bg-background/80 hover:border-primary/30 transition-all duration-300 hover:scale-105 shadow-lg">
                                    <Upload className="mr-2 h-5 w-5" /> {t('uploadContent')}
                                </Button>
                            </Link>
                        </div>

                        {/* Bento Grid Showcase replaces Features Pills */}
                        <div className="mt-8">
                            <FeatureGrid />
                        </div>

                    </div>
                </div>
            </section>

            {/* Custom Animation Styles */}
            <style jsx>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
      `}</style>
        </div>
    )
}
