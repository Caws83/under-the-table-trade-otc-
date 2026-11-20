"use client";

import { createConfig, http, injected } from "wagmi";
import { robinhood, robinhoodTestnet } from "./chain";
import { devMode } from "./config";
import { localDevConnector } from "./localWallet";

export const wagmiConfig = createConfig({
  chains: [robinhood, robinhoodTestnet],
  connectors: [injected({ shimDisconnect: true }), ...(devMode ? [localDevConnector()] : [])],
  transports: {
    [robinhood.id]: http(robinhood.rpcUrls.default.http[0]),
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
