import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, Clock, Upload, Sparkles } from 'lucide-react'
import { mockBooks } from "@/data/languages"
import { useTranslations } from 'next-intl'

export default function Dashboard() {
  const t = useTranslations('Hero')

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-background pb-16 pt-12 sm:pt-20 lg:pb-24">
        <div className="container mx-auto px-4 sm:px-6 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center rounded-full border border-border/60 bg-secondary/40 px-4 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur-sm mb-8">
              <Sparkles className="mr-2 h-3.5 w-3.5 fill-primary text-primary" />
              <span>{t('newFeature')}</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground mb-6">
              {t('title')}
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground/90 mb-10 leading-relaxed max-w-2xl mx-auto">
              {t('subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/library">
                <Button size="lg" className="rounded-full px-8 h-12 text-base font-medium shadow-md hover:shadow-lg transition-all">
                  {t('goToLibrary')}
                </Button>
              </Link>
              <Link href="/upload">
                <Button size="lg" variant="outline" className="rounded-full px-8 h-12 text-base font-medium bg-background hover:bg-secondary/80 border-border/60">
                  <Upload className="mr-2 h-4 w-4" /> {t('uploadContent')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 sm:px-6 py-16 space-y-16">
        {/* Continue Reading Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" /> Continue Reading
            </h2>
            <Link href="/library" className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockBooks.slice(0, 3).map((book) => (
              <Link key={book.id} href={`/reader/${book.id}`} className="group block">
                <div className="bg-card rounded-xl overflow-hidden border border-border/40 shadow-sm hover:shadow-lg transition-all duration-300 h-full flex flex-col">
                  <div className="aspect-[2/1] relative bg-muted flex items-center justify-center overflow-hidden">
                    {book.cover ? (
                      <img
                        src={book.cover || "/placeholder.svg"}
                        alt={book.title}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-muted/80 to-muted flex items-center justify-center">
                        <BookOpen className="h-16 w-16 text-muted-foreground/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-3">
                      <span className="inline-flex items-center rounded-md bg-secondary/80 px-2.5 py-1 text-xs font-medium text-muted-foreground/90 border border-border/30">
                        EPUB
                      </span>
                      <span className="text-xs text-muted-foreground/80">2 hrs left</span>
                    </div>
                    <h3 className="font-semibold text-lg text-foreground mb-1 line-clamp-1">{book.title}</h3>
                    <p className="text-sm text-muted-foreground/80 mb-4">{book.author}</p>

                    <div className="mt-auto pt-4">
                      <div className="flex justify-between text-xs mb-2.5">
                        <span className="text-muted-foreground/80">Progress</span>
                        <span className="font-medium text-foreground">45%</span>
                      </div>
                      <div className="h-2 w-full bg-secondary/60 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full w-[45%] transition-all duration-500 ease-out" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
