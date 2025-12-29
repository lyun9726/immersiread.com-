import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, Clock, Upload, Sparkles, User } from 'lucide-react'
import { mockBooks } from "@/data/languages"
import { useTranslations } from 'next-intl'

export default function Dashboard() {
  const t = useTranslations('Hero')

  return (
    <div className="min-h-screen bg-background pb-20 selection:bg-primary/10 selection:text-primary">
      {/* Hero Section with Aurora Background */}
      <section className="relative overflow-hidden pt-12 sm:pt-20 lg:pb-32 lg:pt-24 border-b border-border/40">
        {/* Ambient Background Glow */}
        <div className="absolute inset-0 -z-10 h-full w-full bg-background [background:radial-gradient(125%_125%_at_50%_10%,#fff_40%,#63e_100%)] dark:[background:radial-gradient(125%_125%_at_50%_10%,#000_40%,#63e_100%)] opacity-[0.15]" />

        {/* Floating Orbs */}
        <div className="absolute top-0 right-0 -z-10 h-[500px] w-[500px] bg-primary/20 blur-[120px] rounded-full translate-x-1/3 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 -z-10 h-[500px] w-[500px] bg-purple-500/20 blur-[120px] rounded-full -translate-x-1/3 translate-y-1/2" />

        <div className="container mx-auto px-4 sm:px-6 relative z-10">
          <div className="max-w-3xl mx-auto text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary backdrop-blur-sm mb-8 shadow-sm">
              <Sparkles className="mr-2 h-3.5 w-3.5 fill-primary text-primary" />
              <span>{t('newFeature')}</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground mb-6 drop-shadow-sm">
              <span className="bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">{t('title').split('，')[0]}</span>
              ，
              <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">{t('title').split('，')[1] || t('title')}</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed max-w-2xl mx-auto font-medium">
              {t('subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/library">
                <Button size="lg" className="rounded-full px-8 h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-105 transition-all duration-300">
                  {t('goToLibrary')}
                </Button>
              </Link>
              <Link href="/upload">
                <Button size="lg" variant="outline" className="rounded-full px-8 h-12 text-base font-semibold bg-background/50 backdrop-blur-sm border-border hover:bg-secondary/80 transition-all duration-300 hover:scale-105">
                  <Upload className="mr-2 h-4 w-4" /> {t('uploadContent')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 sm:px-6 -mt-10 relative z-20 space-y-16">
        {/* Continue Reading Section */}
        <section className="animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              Continue Reading
            </h2>
            <Link href="/library" className="group text-sm font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              View all <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockBooks.slice(0, 3).map((book, index) => {
              // Generate dynamic gradient based on index to differentiate books
              const gradients = [
                "from-blue-500/20 to-cyan-500/20 text-blue-600",
                "from-purple-500/20 to-pink-500/20 text-purple-600",
                "from-amber-500/20 to-orange-500/20 text-amber-600"
              ];
              const gradientClass = gradients[index % gradients.length];

              return (
                <Link key={book.id} href={`/reader/${book.id}`} className="group block h-full">
                  <div className="bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden border border-border/50 shadow-sm hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 h-full flex flex-col group-hover:-translate-y-1">
                    <div className="aspect-[2/1] relative bg-muted overflow-hidden">
                      {book.cover ? (
                        <img
                          src={book.cover || "/placeholder.svg"}
                          alt={book.title}
                          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700"
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${gradientClass.split(' ')[0]} flex flex-col items-center justify-center relative p-6`}>
                          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20" /> {/* Subtle texture if you have it, else invisible */}
                          <div className="w-16 h-20 bg-background/80 backdrop-blur-md rounded border border-white/20 shadow-lg mb-2 flex items-center justify-center transform group-hover:scale-110 transition-transform duration-500">
                            <BookOpen className={`h-8 w-8 ${gradientClass.split(' ')[2]}`} />
                          </div>
                          <p className={`text-xs font-semibold ${gradientClass.split(' ')[2]} opacity-70`}>ReadAI Classic</p>
                        </div>
                      )}

                      {/* Progress Overlay on Image */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary/30">
                        <div className="h-full bg-primary transition-all duration-500 w-[45%]" />
                      </div>
                    </div>

                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex gap-2">
                          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                            EPUB
                          </span>
                        </div>
                      </div>

                      <h3 className="font-bold text-lg text-foreground mb-1 leading-tight group-hover:text-primary transition-colors line-clamp-1">{book.title}</h3>
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-1 flex items-center gap-1">
                        <User className="w-3 h-3" /> {book.author}
                      </p>

                      <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/30">
                        <div className="text-xs font-medium text-muted-foreground">
                          Last read: <span className="text-foreground">2 hrs ago</span>
                        </div>
                        <div className="text-xs font-bold text-primary bg-primary/5 px-2 py-1 rounded-full">
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
    </div>
  )
}
