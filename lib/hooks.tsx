"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BaseError, erc20Abi, isAddress, zeroAddress, type Address, type Abi } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { useToast } from "@/components/Toast";
import { isNative } from "@/lib/config";
import { robinhood } from "@/lib/chain";

export function explain(error: unknown) {
  if (error instanceof BaseError) return error.shortMessage;
  if (error instanceof Error) return error.message.split("\n")[0];
  return "Something went wrong";
}

export function useSend() {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const toast = useToast();

  return async function send(
    request: {
      address: Address;
      abi: Abi | readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
      value?: bigint;
    },
    label: string,
  ) {
    try {
      const hash = await writeContractAsync(request as Parameters<typeof writeContractAsync>[0]);
      toast.push(`Submitted ${label}.`, "info");
      if (!client) throw new Error("The chain client is not ready.");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${label} reverted.`);
      toast.push(`${label} confirmed.`, "ok");
      await queryClient.invalidateQueries();
      return receipt;
    } catch (error) {
      const message = explain(error);
      if (!/user rejected|user denied|rejected the request/i.test(message)) toast.push(message, "err");
      throw error;
    }
  };
}

export function useReadyWallet() {
  const account = useAccount();
  const toast = useToast();
  return {
    ...account,
    ensure() {
      if (!account.isConnected || !account.address) {
        toast.push("Connect a wallet to trade on Under The Counter.", "err");
        return false;
      }
      if (account.chainId !== robinhood.id) {
        toast.push("Switch to Robinhood Chain before sending this transaction.", "err");
        return false;
      }
      return true;
    },
  };
}

export function useTokenMeta(token?: Address) {
  const native = !token || isNative(token);
  const symbol = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "symbol",
    query: { enabled: Boolean(token) && !native },
  });
  const decimals = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: Boolean(token) && !native },
  });
  const name = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "name",
    query: { enabled: Boolean(token) && !native },
  });
  return {
    symbol: native ? "ETH" : symbol.data,
    decimals: native ? 18 : decimals.data,
    name: native ? "Ether" : name.data,
    isLoading: !native && (symbol.isLoading || decimals.isLoading),
  };
}

export function useErc20Balance(token: Address | undefined, owner: Address | undefined) {
  return useReadContract({
    address: token && !isNative(token) ? token : undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: Boolean(token && owner && !isNative(token)), refetchInterval: 4000 },
  });
}

export function useAllowance(token: Address | undefined, owner?: Address, spender?: Address) {
  return useReadContract({
    address: token && !isNative(token) ? token : undefined,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled: Boolean(token && owner && spender && !isNative(token)), refetchInterval: 4000 },
  });
}

export function parseAddress(value: string): Address | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return isAddress(trimmed) ? trimmed : undefined;
}

export { zeroAddress };
