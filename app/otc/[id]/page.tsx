import type { Metadata } from "next";
import { OfferDetail } from "@/components/pages/OfferDetail";

export const metadata: Metadata = { title: "Listing" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OfferDetail id={id} />;
}
