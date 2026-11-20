import type { Metadata } from "next";
import { CreateOfferView } from "@/components/pages/CreateOfferView";

export const metadata: Metadata = { title: "Create listing" };

export default function Page() {
  return <CreateOfferView />;
}
