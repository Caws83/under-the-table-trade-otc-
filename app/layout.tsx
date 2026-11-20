import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: { default: "Under The Counter", template: "%s · Under The Counter" },
  description: "Private deals. Open markets. An independent OTC desk and staking service for Robinhood Chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${fraunces.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
