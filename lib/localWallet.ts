"use client";

import { createConnector, type CreateConnectorFn } from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  hexToBytes,
  http,
  numberToHex,
  type Address,
  type EIP1193EventMap,
  type EIP1193Provider,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "./chain";

export type DevAccountId = "A" | "B";

const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

function emit(event: string, ...args: unknown[]) {
  listeners.get(event)?.forEach((listener) => listener(...args));
}

function rpcUrl() {
  return process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
}

function assertLocalRpc() {
  let hostname = "";
  try {
    hostname = new URL(rpcUrl()).hostname;
  } catch {
    throw new Error("The local development wallet needs a localhost RPC URL.");
  }
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error("The local development wallet only signs against localhost.");
  }
}

export function devAccounts() {
  const keyA = process.env.NEXT_PUBLIC_DEV_KEY_A as `0x${string}` | undefined;
  const keyB = process.env.NEXT_PUBLIC_DEV_KEY_B as `0x${string}` | undefined;
  if (!keyA || !keyB || !keyA.startsWith("0x") || !keyB.startsWith("0x")) return null;
  return {
    A: privateKeyToAccount(keyA),
    B: privateKeyToAccount(keyB),
  };
}

export function selectedDevAccount(): DevAccountId {
  if (typeof window === "undefined") return "A";
  return window.localStorage.getItem("utc.devAccount") === "B" ? "B" : "A";
}

export function selectDevAccount(id: DevAccountId) {
  window.localStorage.setItem("utc.devAccount", id);
  const accounts = devAccounts();
  if (!accounts) return;
  emit("accountsChanged", [accounts[id].address]);
}

let provider: EIP1193Provider | undefined;

function localProvider(): EIP1193Provider {
  if (provider) return provider;
  assertLocalRpc();
  const publicClient = createPublicClient({ chain: robinhood, transport: http(rpcUrl()) });

  const request = async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
    const accounts = devAccounts();
    if (!accounts) throw new Error("Local development keys are not configured.");
    const account = accounts[selectedDevAccount()];
    const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpcUrl()) });
    const list = (params ?? []) as unknown[];

    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return numberToHex(robinhood.id);
      case "eth_sendTransaction": {
        const tx = (list[0] ?? {}) as { to?: Address; data?: `0x${string}`; value?: string; gas?: string };
        if (!tx.to) throw new Error("Transaction is missing a destination.");
        return wallet.sendTransaction({
          account,
          chain: robinhood,
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
        });
      }
      case "personal_sign": {
        const message = list[0] as `0x${string}`;
        return account.signMessage({ message: { raw: hexToBytes(message) } });
      }
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;
      default:
        return publicClient.request({ method, params } as never);
    }
  };

  provider = {
    request,
    on(event: string, listener: (...args: unknown[]) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as (...args: unknown[]) => void);
      listeners.set(event, set);
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
    },
  } as unknown as EIP1193Provider;
  return provider;
}

export function localDevConnector(): CreateConnectorFn {
  return createConnector((config) => ({
    id: "utc-local",
    name: "Under The Counter Local",
    type: "utcLocal",
    async setup() {
      const current = (await this.getProvider()) as EIP1193Provider;
      current.on?.("accountsChanged", ((accounts: string[]) => {
        config.emitter.emit("change", { accounts: accounts as Address[] });
      }) as EIP1193EventMap["accountsChanged"]);
    },
    async connect() {
      assertLocalRpc();
      const accounts = devAccounts();
      if (!accounts) throw new Error("Local development keys are not configured.");
      return { accounts: [accounts[selectedDevAccount()].address], chainId: robinhood.id } as never;
    },
    async disconnect() {},
    async getAccounts() {
      const accounts = devAccounts();
      if (!accounts) return [];
      return [accounts[selectedDevAccount()].address];
    },
    async getChainId() {
      return robinhood.id;
    },
    async getProvider() {
      return localProvider();
    },
    async isAuthorized() {
      if (typeof window === "undefined") return false;
      return process.env.NEXT_PUBLIC_DEV_MODE === "true" && Boolean(devAccounts());
    },
    async switchChain({ chainId }) {
      if (chainId !== robinhood.id) {
        throw new Error("The local development wallet stays on the local Robinhood fork.");
      }
      const chain = config.chains.find((item) => item.id === chainId);
      if (!chain) throw new Error("Robinhood Chain is not configured.");
      return chain;
    },
    onAccountsChanged(accounts) {
      if (accounts.length === 0) config.emitter.emit("disconnect");
      else config.emitter.emit("change", { accounts: accounts.map((account) => account as Address) });
    },
    onChainChanged() {},
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}
