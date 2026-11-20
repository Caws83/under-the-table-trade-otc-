import type { Metadata } from "next";
import { HomeView } from "@/components/pages/HomeView";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <HomeView />;
}
