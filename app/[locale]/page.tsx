"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, Clock, Upload, Sparkles, User, Headphones, Languages, Brain } from 'lucide-react'
import { mockBooks } from "@/data/languages"
import { useTranslations } from 'next-intl'

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

        {/* Floating Decorative Elements */}
        <div className="absolute top-32 left-[15%] -z-5 opacity-20 animate-float">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-purple-500 rounded-2xl rotate-12 shadow-xl" />
        </div>
        <div className="absolute bottom-40 right-[20%] -z-5 opacity-15 animate-float" style={{ animationDelay: '2s' }}>
          <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl -rotate-12 shadow-xl" />
        </div>
        <div className="absolute top-48 right-[25%] -z-5 opacity-10 animate-float" style={{ animationDelay: '3s' }}>
          <Headphones className="w-10 h-10 text-primary" />
        </div>

        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 -z-5 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

        <div className="container mx-auto px-4 sm:px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Feature Badge */}
            <div className="inline-flex items-center rounded-full border border-primary/30 bg-gradient-to-r from-primary/10 to-purple-500/10 px-5 py-2 text-sm font-semibold text-primary backdrop-blur-md mb-10 shadow-lg shadow-primary/5 hover:scale-105 transition-transform cursor-default">
              <Sparkles className="mr-2 h-4 w-4 fill-primary text-primary animate-pulse" />
              <span>{t('newFeature')}</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground mb-8 leading-[1.1]">
              <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">{t('title').split('，')[0]}</span>
              <span className="text-foreground/80">，</span>
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">{t('title').split('，')[1] || t('title')}</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-muted-foreground/80 mb-12 leading-relaxed max-w-2xl mx-auto font-medium">
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

            {/* Feature Pills */}
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { icon: Headphones, label: 'AI 朗读', color: 'from-blue-500 to-cyan-500' },
                { icon: Languages, label: '即时翻译', color: 'from-purple-500 to-pink-500' },
                { icon: Brain, label: '智能笔记', color: 'from-amber-500 to-orange-500' },
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/50 backdrop-blur-sm border border-border/30 text-sm font-medium text-muted-foreground hover:bg-background/80 hover:text-foreground transition-all cursor-default shadow-sm">
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${feature.color} flex items-center justify-center`}>
                    <feature.icon className="w-3 h-3 text-white" />
                  </div>
                  {feature.label}
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
                <Clock className="h-6 w-6 text-primary" />
              </div>
              Continue Reading
            </h2>
            <Link href="/library" className="group text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 bg-muted/50 hover:bg-primary/10 px-4 py-2 rounded-full">
              View all <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {mockBooks.slice(0, 3).map((book, index) => {
              // Generate dynamic gradient based on index to differentiate books
              const gradients = [
                { bg: "from-blue-500/20 via-cyan-500/10 to-blue-500/5", accent: "text-blue-600", border: "group-hover:border-blue-400/50" },
                { bg: "from-purple-500/20 via-pink-500/10 to-purple-500/5", accent: "text-purple-600", border: "group-hover:border-purple-400/50" },
                { bg: "from-amber-500/20 via-orange-500/10 to-amber-500/5", accent: "text-amber-600", border: "group-hover:border-amber-400/50" }
              ];
              const gradient = gradients[index % gradients.length];

              return (
                <Link key={book.id} href={`/reader/${book.id}`} className="group block h-full">
                  <div className={`bg-card/80 backdrop-blur-xl rounded-3xl overflow-hidden border-2 border-border/40 ${gradient.border} shadow-lg hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 h-full flex flex-col group-hover:-translate-y-2`}>
                    <div className="aspect-[16/10] relative bg-muted overflow-hidden">
                      {book.cover ? (
                        <>
                          {/* Blurred Background Layer */}
                          <div
                            className="absolute inset-0 bg-cover bg-center blur-2xl scale-150 opacity-60 group-hover:scale-[1.8] transition-transform duration-1000"
                            style={{ backgroundImage: `url(${book.cover})` }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                          {/* Main Cover Image - Enhanced Floating effect */}
                          <div className="absolute inset-0 flex items-center justify-center p-6">
                            <img
                              src={book.cover}
                              alt={book.title}
                              className="h-full w-auto max-w-[70%] object-contain shadow-2xl shadow-black/30 rounded-lg transform group-hover:rotate-3 group-hover:scale-110 transition-all duration-700 ease-out"
                            />
                          </div>

                          {/* Shine Effect on Hover */}
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                        </>
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${gradient.bg} flex flex-col items-center justify-center relative p-6`}>
                          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-30" />
                          <div className="w-20 h-24 bg-background/90 backdrop-blur-xl rounded-lg border border-white/30 shadow-2xl mb-3 flex items-center justify-center transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                            <BookOpen className={`h-10 w-10 ${gradient.accent}`} />
                          </div>
                          <p className={`text-xs font-bold ${gradient.accent} opacity-80 uppercase tracking-widest`}>ReadAI</p>
                        </div>
                      )}

                      {/* Progress Bar - Enhanced */}
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20 backdrop-blur">
                        <div className="h-full bg-gradient-to-r from-primary via-blue-400 to-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.7)] transition-all duration-500" style={{ width: '45%' }} />
                      </div>
                    </div>

                    <div className="p-6 flex flex-col flex-1 bg-gradient-to-b from-transparent to-muted/30">
                      <div className="flex justify-between items-start mb-3">
                        <span className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary uppercase tracking-wider shadow-sm">
                          EPUB
                        </span>
                      </div>

                      <h3 className="font-bold text-xl text-foreground mb-2 leading-tight group-hover:text-primary transition-colors duration-300 line-clamp-1">{book.title}</h3>
                      <p className="text-sm text-muted-foreground mb-5 line-clamp-1 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> {book.author}
                      </p>

                      <div className="mt-auto flex items-center justify-between pt-4 border-t border-border/50">
                        <div className="text-xs font-medium text-muted-foreground">
                          Last read: <span className="text-foreground font-semibold">2 hrs ago</span>
                        </div>
                        <div className="text-sm font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full shadow-inner">
                          45%
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      </div>

      {/* Custom Animation Styles */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  )
}
