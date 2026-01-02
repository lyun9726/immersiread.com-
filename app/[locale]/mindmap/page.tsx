"use client"

import { BrainCircuit } from "lucide-react"
import { useTranslations } from 'next-intl'

export default function MindmapPage() {
  const t = useTranslations('Mindmap')

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[60vh]">
      <div className="p-6 bg-primary/5 rounded-full mb-6">
        <BrainCircuit className="h-16 w-16 text-primary" />
      </div>
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        {t('description')}
      </p>
      <div className="w-full max-w-3xl h-64 bg-muted/30 border-2 border-dashed rounded-xl flex items-center justify-center">
        <span className="text-muted-foreground font-medium">{t('placeholder')}</span>
      </div>
    </div>
  )
}
