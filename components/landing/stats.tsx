"use client"

import { CheckCircle2, Globe2, Users, Zap } from 'lucide-react'

// Layout inspired by PodLM's clean grid style
export function Stats() {
    return (
        <div className="w-full py-12 border-b border-border/40 bg-muted/20">
            <div className="container mx-auto px-4">
                {/* PodLM style often has a centered heading or clean grid. We use a 4-col grid here. */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center">

                    <div className="flex flex-col items-center justify-center p-4 group">
                        <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-2xl text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300">
                            <Globe2 className="w-8 h-8" />
                        </div>
                        <div className="text-4xl font-extrabold tracking-tight mb-2 text-foreground">30+</div>
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Languages</p>
                    </div>

                    <div className="flex flex-col items-center justify-center p-4 group">
                        <div className="mb-4 p-3 bg-purple-100 dark:bg-purple-900/30 rounded-2xl text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform duration-300">
                            <Zap className="w-8 h-8" />
                        </div>
                        <div className="text-4xl font-extrabold tracking-tight mb-2 text-foreground">0.5s</div>
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Latency</p>
                    </div>

                    <div className="flex flex-col items-center justify-center p-4 group">
                        <div className="mb-4 p-3 bg-amber-100 dark:bg-amber-900/30 rounded-2xl text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform duration-300">
                            <Users className="w-8 h-8" />
                        </div>
                        <div className="text-4xl font-extrabold tracking-tight mb-2 text-foreground">10k+</div>
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Readers</p>
                    </div>

                    <div className="flex flex-col items-center justify-center p-4 group">
                        <div className="mb-4 p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform duration-300">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div className="text-4xl font-extrabold tracking-tight mb-2 text-foreground">99.9%</div>
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Accuracy</p>
                    </div>

                </div>
            </div>
        </div>
    )
}
