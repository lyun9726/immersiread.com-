import { BookOpen, Sparkles } from 'lucide-react'

export default function LibraryLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] w-full overflow-hidden">
      {/* Animated Loader Container */}
      <div className="relative flex items-center justify-center mb-10">

        {/* Outer Ripple Effect */}
        <div className="absolute w-[300px] h-[300px] bg-primary/5 rounded-full animate-ping opacity-75" style={{ animationDuration: '3s' }} />
        <div className="absolute w-[200px] h-[200px] bg-primary/10 rounded-full animate-ping opacity-75" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />

        {/* Spinning Rings */}
        <div className="absolute inset-0 m-auto w-32 h-32 rounded-full border-2 border-transparent border-t-primary/60 border-bd-primary/60 animate-[spin_3s_linear_infinite]" />
        <div className="absolute inset-0 m-auto w-24 h-24 rounded-full border-2 border-transparent border-r-primary/40 border-l-primary/40 animate-[spin_2s_linear_infinite_reverse]" />

        {/* Center Icon with Glow */}
        <div className="relative z-10 bg-background/80 backdrop-blur-sm p-6 rounded-3xl border border-primary/10 shadow-2xl shadow-primary/20">
          <BookOpen className="w-10 h-10 text-primary animate-pulse duration-1000" />
          <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-amber-400 animate-bounce" />
        </div>
      </div>

      {/* Text Content */}
      <div className="space-y-3 text-center z-10">
        <h3 className="text-2xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent animate-pulse">
          Opening Library...
        </h3>
        <p className="text-muted-foreground/80 font-medium text-sm tracking-wide">
          Syncing your reading progress
        </p>
      </div>
    </div>
  )
}
