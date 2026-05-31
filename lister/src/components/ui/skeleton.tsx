import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-border/60 dark:bg-border/40",
        className,
      )}
    />
  );
}
