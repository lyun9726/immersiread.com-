import { Skeleton } from "@/components/ui/skeleton"

export default function LibraryLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Skeleton className="h-10 w-full md:w-64" />
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
        {/* Upload Card Skeleton */}
        <div className="aspect-[3/4]">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
        {/* Book Skeletons */}
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="aspect-[3/4]">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
