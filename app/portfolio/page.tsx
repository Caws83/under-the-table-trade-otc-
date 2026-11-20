import type { Metadata } from "next";
import { PortfolioView } from "@/components/pages/PortfolioView";

export const metadata: Metadata = { title: "Portfolio" };

export default function Page() {
  return <PortfolioView />;
}
