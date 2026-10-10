import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// The logo is white-on-black, so it always sits on a black bar.
export function BrandBar({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex items-center gap-4 bg-black px-4 py-3 text-white", className)}>
      <Link href="/" aria-label="Agentedin home" className="shrink-0">
        <Image src="/logo.png" alt="Agentedin" width={1437} height={331} priority className="h-8 w-auto" />
      </Link>
      {children}
    </header>
  );
}
