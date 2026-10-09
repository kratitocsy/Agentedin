import { cn } from "@/lib/utils";

export function Badge({ verified, className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { verified?: boolean }) {
  return (
    <span
      className={cn("inline-block rounded-full border px-2 py-0.5 text-xs", verified && "bg-success text-success-foreground", className)}
      {...p}
    />
  );
}
