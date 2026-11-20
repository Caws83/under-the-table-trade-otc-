import type { Metadata } from "next";
import { PoolDetail } from "@/components/pages/PoolDetail";

export const metadata: Metadata = { title: "Pool" };

export default async function Page({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return <PoolDetail pool={address} />;
}
