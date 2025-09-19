import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const BusinessTripSkeleton = () => (
  <div className="space-y-6">
    {/* Header skeleton */}
    <div className="flex justify-between items-center">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>

    {/* Employee cards skeleton */}
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex justify-between items-start mb-4">
              <Skeleton className="h-6 w-32" />
              <div className="text-right">
                <Skeleton className="h-8 w-24 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="bg-muted rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                  <Skeleton className="h-8 w-8 mb-1" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>

    {/* Table skeleton */}
    <Card className="p-4">
      <div className="mb-4">
        <Skeleton className="h-6 w-32 mb-2" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="text-center">
              <Skeleton className="h-16 w-16 mx-auto mb-2" />
              <Skeleton className="h-4 w-20 mx-auto mb-1" />
              <Skeleton className="h-3 w-16 mx-auto" />
            </div>
          ))}
        </div>
      </div>
      
      {/* Table header */}
      <div className="border rounded-t-lg overflow-hidden">
        <div className="bg-muted p-2 grid grid-cols-12 gap-1">
          <Skeleton className="h-4 w-full" />
          {Array.from({ length: 11 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-6" />
          ))}
        </div>
        
        {/* Table rows */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border-t p-2 grid grid-cols-12 gap-1">
            <Skeleton className="h-4 w-full" />
            {Array.from({ length: 11 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-6" />
            ))}
          </div>
        ))}
      </div>
    </Card>
  </div>
);