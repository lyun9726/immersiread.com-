"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles, BookOpen, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function LandingHero() {
    const t = useTranslations('Hero')

    return (
        <section className="relative overflow-hidden pt-24 pb-32 md:pt-32 md:pb-48">
            {/* Background Effects */}
            <div className="absolute inset-0 -z-10 h-full w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-background"></div>

            {/* Spotlight Effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/20 blur-[120px] rounded-[100%] pointer-events-none opacity-50 dark:opacity-30" />

            <div className="container mx-auto px-4 relative z-10 text-center">
                {/* Announcement Pill */}
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                    Next-Gen AI Reading Platform
                </div>

                {/* Main Heading */}
                <h1 className="max-w-4xl mx-auto text-5xl md:text-7xl font-bold tracking-tighter mb-8 leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                    <span className="bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-transparent">
                        {t('title')}
                    </span>
                </h1>

                {/* Subtitle */}
                <p className="max-w-2xl mx-auto text-xl text-muted-foreground mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                    {t('subtitle')}
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                    <Link href="/library">
                        <Button size="lg" className="h-12 px-8 rounded-full text-base font-medium shadow-[0_0_20px_-5px_rgba(0,0,0,0.3)] hover:shadow-[0_0_25px_-5px_rgba(0,0,0,0.4)] transition-all">
                            <BookOpen className="mr-2 h-5 w-5" />
                            {t('goToLibrary')}
                        </Button>
                    </Link>
                    <Link href="/upload">
                        <Button size="lg" variant="outline" className="h-12 px-8 rounded-full text-base font-medium bg-background/50 backdrop-blur-sm border-primary/20 hover:bg-primary/5 transition-all">
                            <Upload className="mr-2 h-5 w-5" />
                            {t('uploadContent')}
                        </Button>
                    </Link>
                </div>

                {/* Glow effect at bottom of hero */}
                <div className="absolute top-[120%] left-1/2 -translate-x-1/2 w-[600px] h-[100px] bg-primary/40 blur-[80px] rounded-[100%] pointer-events-none" />
            </div>
        </section>
    )
}
