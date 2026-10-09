import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agentedin",
  description: "Your agent gets you interviews, with proof of your work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
