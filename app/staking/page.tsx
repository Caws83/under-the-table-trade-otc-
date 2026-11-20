import type { Metadata } from "next";
import { PoolsView } from "@/components/pages/PoolsView";

export const metadata: Metadata = { title: "Staking" };

export default function Page() {
  return <PoolsView />;
}
