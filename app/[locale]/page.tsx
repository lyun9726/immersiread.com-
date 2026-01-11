"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, Clock, Upload, Sparkles, User, Headphones, Languages, Brain, BookMarked } from 'lucide-react'
import { mockBooks } from "@/data/languages"
import { useTranslations } from 'next-intl'

// Book Card Component with image error handling
function BookCard({ book, index }: { book: typeof mockBooks[0], index: number }) {
  const [imageError, setImageError] = useState(false);

  const gradients = [
    { bg: "from-blue-600 via-cyan-500 to-blue-400", accent: "text-blue-100", border: "group-hover:border-blue-400/50" },
    { bg: "from-violet-600 via-purple-500 to-fuchsia-400", accent: "text-purple-100", border: "group-hover:border-purple-400/50" },
    { bg: "from-amber-500 via-orange-500 to-red-400", accent: "text-amber-100", border: "group-hover:border-amber-400/50" }
  ];
  const gradient = gradients[index % gradients.length];
  const initials = book.title.split(' ').length > 1
    ? book.title.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : book.title.slice(0, 2).toUpperCase();
  const hasCover = book.cover && !imageError;

  return (
    <Link href={`/reader/${book.id}`} className="group block h-full">
      <div className={`bg-card/80 backdrop-blur-xl rounded-3xl overflow-hidden border-2 border-border/40 ${gradient.border} shadow-lg hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 h-full flex flex-col group-hover:-translate-y-2`}>
        <div className="aspect-[16/10] relative overflow-hidden">
          {hasCover ? (
            <>
              {/* Blurred Background Layer */}
              <div
                className="absolute inset-0 bg-cover bg-center blur-2xl scale-150 opacity-60 group-hover:scale-[1.8] transition-transform duration-1000"
                style={{ backgroundImage: `url(${book.cover})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

              {/* Main Cover Image */}
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <img
                  src={book.cover}
                  alt={book.title}
                  className="h-full w-auto max-w-[70%] object-contain shadow-2xl shadow-black/30 rounded-lg transform group-hover:rotate-3 group-hover:scale-110 transition-all duration-700 ease-out"
                  onError={() => setImageError(true)}
                />
              </div>

              {/* Shine Effect */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            </>
          ) : (
            /* Premium Placeholder for books without cover or failed to load */
            <div className={`w-full h-full bg-gradient-to-br ${gradient.bg} flex flex-col items-center justify-center relative overflow-hidden`}>
              {/* Decorative Pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 left-4 w-20 h-20 border-2 border-white/30 rounded-full" />
                <div className="absolute bottom-8 right-8 w-32 h-32 border-2 border-white/20 rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-white/10 rounded-full" />
              </div>

              {/* Main Content */}
              <div className="relative z-10 flex flex-col items-center">
                {/* Book Icon with Initials */}
                <div className="w-24 h-28 bg-white/20 backdrop-blur-sm rounded-lg border border-white/30 shadow-2xl mb-4 flex items-center justify-center transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                  <span className={`text-3xl font-black ${gradient.accent} drop-shadow-lg`}>{initials}</span>
                </div>

                {/* Book Title Preview */}
                <p className={`text-sm font-bold ${gradient.accent} opacity-90 text-center px-4 line-clamp-1 max-w-[80%]`}>
                  {book.title}
                </p>
              </div>

              {/* Shine Effect */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            </div>
          )}

          {/* Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20 backdrop-blur">
            <div
              className="h-full bg-gradient-to-r from-white/80 via-white to-white/80 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-500"
              style={{ width: `${30 + index * 15}%` }}
            />
          </div>
        </div>

        <div className="p-6 flex flex-col flex-1 bg-gradient-to-b from-transparent to-muted/20">
          <h3 className="font-bold text-xl text-foreground mb-2 leading-tight group-hover:text-primary transition-colors duration-300 line-clamp-1">{book.title}</h3>
          <p className="text-sm text-muted-foreground mb-4 line-clamp-1 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> {book.author}
          </p>

          <div className="mt-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${gradient.bg}`} />
              <span className="text-xs text-muted-foreground">Reading</span>
            </div>
            <div className="text-sm font-bold text-foreground bg-muted/50 px-3 py-1.5 rounded-full">
              {30 + index * 15}%
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const t = useTranslations('Hero')

  return (
    <div className="min-h-screen bg-background pb-20 selection:bg-primary/10 selection:text-primary overflow-hidden">
      {/* Hero Section with Enhanced Aurora Background */}
      <section className="relative overflow-hidden pt-16 sm:pt-24 lg:pb-40 lg:pt-32 border-b border-border/30">
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
            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-6">
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

            {/* Feature Pills - More Prominent */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mt-10">
              {[
                { icon: Headphones, label: t('features.tts'), color: 'from-blue-500 to-cyan-500', desc: t('features.ttsDesc') },
                { icon: Languages, label: t('features.translation'), color: 'from-purple-500 to-pink-500', desc: t('features.translationDesc') },
                { icon: Brain, label: t('features.notes'), color: 'from-amber-500 to-orange-500', desc: t('features.notesDesc') },
              ].map((feature, i) => (
                <div key={i} className="group flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2 sm:py-3 rounded-xl sm:rounded-2xl bg-background/70 backdrop-blur-md border border-border/40 hover:border-primary/30 hover:bg-background/90 transition-all duration-300 cursor-default shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                    <feature.icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs sm:text-sm font-bold text-foreground whitespace-nowrap">{feature.label}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">{feature.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 sm:px-6 -mt-16 relative z-20 space-y-20">
        {/* Continue Reading Section */}
        <section className="animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <div className="bg-gradient-to-br from-primary/20 to-purple-500/20 p-3 rounded-xl shadow-inner">
                <BookMarked className="h-6 w-6 text-primary" />
              </div>
              {t('continueReading')}
            </h2>
            <Link href="/library" className="group text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 bg-muted/50 hover:bg-primary/10 px-4 py-2 rounded-full">
              {t('viewAll')} <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {mockBooks.slice(0, 3).map((book, index) => (
              <BookCard key={book.id} book={book} index={index} />
            ))}
          </div>
        </section>
      </div>

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
