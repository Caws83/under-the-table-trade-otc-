import { defineChain } from "viem";

const configuredRpc = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [configuredRpc] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" },
  },
});

export function isLocalRpc() {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL || "";
  return rpc.includes("127.0.0.1") || rpc.includes("localhost");
}

export function explorerAddress(address: string, chainId?: number) {
  if (isLocalRpc() && chainId === robinhood.id) return null;
  const base =
    chainId === robinhoodTestnet.id
      ? "https://explorer.testnet.chain.robinhood.com"
      : "https://robinhoodchain.blockscout.com";
  return `${base}/address/${address}`;
}

export function explorerTx(hash: string, chainId?: number) {
  if (isLocalRpc() && chainId === robinhood.id) return null;
  const base =
    chainId === robinhoodTestnet.id
      ? "https://explorer.testnet.chain.robinhood.com"
      : "https://robinhoodchain.blockscout.com";
  return `${base}/tx/${hash}`;
}
