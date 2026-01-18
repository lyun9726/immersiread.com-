"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, Clock, Upload, Sparkles, User, Headphones, Languages, Brain, BookMarked } from 'lucide-react'
import { mockBooks } from "@/data/languages"
import { useTranslations } from 'next-intl'
import { Stats } from "@/components/landing/stats"

function BookCard({ book, index }: { book: any, index: number }) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/20 animate-in fade-in slide-in-from-bottom-8"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${book.color} bg-opacity-10`}>
          <BookOpen className="h-6 w-6 text-foreground" />
        </div>
        {book.progress && (
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
            {book.progress}%
          </span>
        )}
      </div>

      <div className="mb-4">
        <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">{book.title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{book.description}</p>
      </div>

      <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Languages className="h-4 w-4" />
          <span>{book.language}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span>15m left</span>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const t = useTranslations('Hero')

  return (
    <div className="min-h-screen bg-background pb-20 selection:bg-primary/10 selection:text-primary overflow-hidden">
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
          <div className="max-w-4xl mx-auto text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
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
            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-16">
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

            {/* Stats Component (Added per request) */}
            <Stats />

          </div>
        </div>
      </section>

      {/* Continue Reading Section (Restored) */}
      <section className="container mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold tracking-tight">{t('continueReading')}</h2>
          <Link href="/library">
            <Button variant="ghost" className="text-muted-foreground hover:text-primary">
              View all <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
        {/* Mock Books Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockBooks.slice(0, 3).map((book, i) => (
            <BookCard key={i} book={book} index={i} />
          ))}
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
