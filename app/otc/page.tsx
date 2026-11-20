import type { Metadata } from "next";
import { MarketView } from "@/components/pages/MarketView";

export const metadata: Metadata = { title: "OTC market" };

export default function Page() {
  return <MarketView />;
}
