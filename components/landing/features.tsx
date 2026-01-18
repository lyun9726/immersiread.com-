"use client"

import { BookOpen, Headphones, Sparkles, Languages, FileText, Smartphone, Cloud, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'

// Reusable Feature Card Wrapper
// Replicating Launch UI's "Bento" card style: bordered, subtle background, hover effects
function BentoCard({ children, className = "", span = "col-span-1 row-span-1" }: { children: React.ReactNode, className?: string, span?: string }) {
    return (
        <div className={`group relative overflow-hidden rounded-3xl border border-border/40 bg-card/50 backdrop-blur-sm p-6 md:p-8 hover:border-primary/50 transition-colors duration-500 ${span} ${className}`}>
            {/* Searchlight/Glow Effect on Hover */}
            <div className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
            </div>
            <div className="relative z-10 h-full flex flex-col">
                {children}
            </div>
        </div>
    )
}

export function LandingFeatures() {
    return (
        <section className="container mx-auto px-4 pb-32">
            <div className="mb-12 md:mb-20 text-center max-w-3xl mx-auto">
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
                    全能工具箱，<span className="text-primary">重塑阅读体验</span>
                </h2>
                <p className="text-lg text-muted-foreground">
                    打破语言障碍，提升理解效率，一切为您而设计。
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 grid-rows-[auto_auto_auto] gap-4 md:gap-6 lg:h-[800px]">

                {/* 1. Main Feature: Immersive Bilingual Reading (Large, Top Left) */}
                <BentoCard span="md:col-span-2 md:row-span-2" className="flex flex-col justify-between overflow-hidden">
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <h3 className="text-xl font-semibold">沉浸式双语阅读</h3>
                        </div>
                        <p className="text-muted-foreground max-w-md">
                            中英对照，句级对齐。点击任意段落即可聚焦。像母语一样流畅阅读原版书。
                        </p>
                    </div>

                    {/* Mock UI Showcase */}
                    <div className="relative mt-auto w-full h-[300px] bg-background border border-border/50 rounded-tl-2xl shadow-xl overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                        <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-transparent z-10 pointer-events-none" />
                        <div className="p-6 grid grid-cols-2 gap-8 text-sm opacity-90">
                            <div className="space-y-4 font-serif leading-relaxed text-foreground/80">
                                <p>In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.</p>
                                <p className="invisible">"Whenever you feel like criticizing any one," he told me, "just remember that all the people in this world haven't had the advantages that you've had."</p>
                            </div>
                            <div className="space-y-4 font-sans leading-relaxed text-foreground/60">
                                <p>在我年纪还轻、阅历尚浅的那些年里，父亲曾经给过我一句忠告，直到今天，我仍马上能在脑海里回味着。</p>
                                <p className="invisible">“每逢你想要对别人评头论足的时候，”他对我说，“要记住，世上并非所有的人，都有你那样的优越条件。”</p>
                            </div>
                        </div>

                        {/* Active Sentence Highlight Mock */}
                        <div className="absolute top-6 left-4 right-4 h-24 border-2 border-primary/20 bg-primary/5 rounded-lg pointer-events-none" />
                    </div>
                </BentoCard>

                {/* 2. Audio Feature: Neural TTS (Tall, Top Right) */}
                <BentoCard span="md:col-span-1 md:row-span-2" className="flex flex-col">
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                                <Headphones className="w-5 h-5" />
                            </div>
                            <h3 className="text-xl font-semibold">AI 拟人伴读</h3>
                        </div>
                        <p className="text-muted-foreground font-medium text-sm">
                            微软 Azure 语音技术加持，情感丰富，媲美真人。
                        </p>
                    </div>

                    <div className="mt-8 flex-1 flex flex-col items-center justify-center relative">
                        {/* Waveform Animation Mock */}
                        <div className="flex items-center gap-1.5 h-32">
                            {[40, 70, 45, 80, 55, 90, 60, 80, 50, 70, 40].map((h, i) => (
                                <div
                                    key={i}
                                    className="w-2.5 rounded-full bg-gradient-to-t from-purple-500 to-pink-500 animate-pulse"
                                    style={{
                                        height: `${h}%`,
                                        animationDelay: `${i * 0.15}s`,
                                        opacity: 0.8
                                    }}
                                />
                            ))}
                        </div>
                        <div className="absolute bottom-8 flex gap-4">
                            <div className="h-10 w-10 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors cursor-pointer">
                                <div className="w-0 h-0 border-l-[10px] border-l-foreground border-y-[6px] border-y-transparent ml-1" />
                            </div>
                        </div>
                    </div>
                </BentoCard>

                {/* 3. Knowledge Distillation (Wide, Bottom) */}
                <BentoCard span="md:col-span-2 md:row-span-1" className="flex items-center gap-8">
                    <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <h3 className="text-xl font-semibold">智能知识提炼</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">
                            AI 自动分析书籍内容，一键生成摘要、思维导图与核心词汇表。
                        </p>
                    </div>

                    {/* Summary Cards Graphics */}
                    <div className="hidden md:flex flex-1 gap-3 perspective-1000">
                        <div className="bg-background border border-border/60 p-4 rounded-xl shadow-lg -rotate-6 scale-90 opacity-60">
                            <div className="w-16 h-2 bg-muted rounded mb-2" />
                            <div className="w-24 h-2 bg-muted/50 rounded" />
                        </div>
                        <div className="bg-background border border-border p-4 rounded-xl shadow-xl z-10">
                            <div className="w-20 h-2 bg-primary/20 rounded mb-2" />
                            <div className="space-y-1.5">
                                <div className="w-full h-1.5 bg-muted rounded" />
                                <div className="w-5/6 h-1.5 bg-muted rounded" />
                                <div className="w-4/6 h-1.5 bg-muted rounded" />
                            </div>
                        </div>
                        <div className="bg-background border border-border/60 p-4 rounded-xl shadow-lg rotate-6 scale-90 opacity-60">
                            <div className="w-16 h-2 bg-muted rounded mb-2" />
                            <div className="w-24 h-2 bg-muted/50 rounded" />
                        </div>
                    </div>
                </BentoCard>

                {/* 4. Cross Platform (Small, Bottom Right) */}
                <BentoCard className="">
                    <div className="h-full flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <Smartphone className="w-5 h-5" />
                                </div>
                                <h3 className="text-xl font-semibold">全平台同步</h3>
                            </div>
                            <p className="text-muted-foreground text-sm">进度实时云端同步，手机、平板、网页端无缝接续。</p>
                        </div>
                        <div className="flex justify-end mt-4 text-emerald-500/50">
                            <Cloud className="w-16 h-16 opacity-20" />
                        </div>
                    </div>
                </BentoCard>

            </div>
        </section>
    )
}
