"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WagmiProvider } from "wagmi";
import { Shell } from "@/components/Shell";
import { ToastProvider } from "@/components/Toast";
import { robinhood, robinhoodTestnet } from "@/lib/chain";
import { reownProjectId } from "@/lib/config";
import { wagmiConfig } from "@/lib/wagmi";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const [reownReady, setReownReady] = useState(false);

  useEffect(() => {
    if (!reownProjectId) return;
    let cancelled = false;
    void (async () => {
      const [{ createAppKit }, { WagmiAdapter }] = await Promise.all([
        import("@reown/appkit/react"),
        import("@reown/appkit-adapter-wagmi"),
      ]);
      if (cancelled) return;
      const networks = [robinhood, robinhoodTestnet] as never;
      const adapter = new WagmiAdapter({ networks, projectId: reownProjectId, ssr: true });
      createAppKit({
        adapters: [adapter],
        networks,
        projectId: reownProjectId,
        metadata: {
          name: "Under The Counter",
          description: "Private deals. Open markets.",
          url: window.location.origin,
          icons: [`${window.location.origin}/logo.svg`],
        },
        themeMode: "dark",
        themeVariables: { "--w3m-accent": "#7EF2D0" },
      });
      setReownReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Shell>
            {reownReady ? <ReownSlot /> : null}
            {children}
          </Shell>
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function ReownSlot() {
  return (
    <div className="spread" style={{ marginBottom: 12 }}>
      <span className="muted">Reown wallet options</span>
      {createReownButton()}
    </div>
  );
}

function createReownButton() {
  return <appkit-button />;
}
