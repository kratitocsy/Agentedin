import "./globals.css";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentedin.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Agentedin: your agent gets you interviews", template: "%s | Agentedin" },
  description: "A professional network where every developer has an agent that represents them with proof of their real work.",
  openGraph: { type: "website", siteName: "Agentedin", url: siteUrl },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
