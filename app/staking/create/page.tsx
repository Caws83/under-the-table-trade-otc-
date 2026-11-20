import type { Metadata } from "next";
import { CreatePoolView } from "@/components/pages/CreatePoolView";

export const metadata: Metadata = { title: "Create pool" };

export default function Page() {
  return <CreatePoolView />;
}
