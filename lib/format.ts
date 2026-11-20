import { type Address } from "viem";
import { isNative } from "./config";

export function parseAmount(input: string, decimals: number): bigint | null {
  const value = input.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) return null;
  try {
    return BigInt(whole + fraction.padEnd(decimals, "0"));
  } catch {
    return null;
  }
}

export function formatAmount(value: bigint, decimals: number, maxFraction = 6) {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const fraction = abs % scale;
  const digits = fraction.toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  const text = digits ? `${whole.toString()}.${digits}` : whole.toString();
  return negative ? `-${text}` : text;
}

export function shortAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatWhen(seconds: number) {
  if (!seconds) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(seconds * 1000);
}

export function formatDuration(seconds: number) {
  if (seconds <= 0) return "ended";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${seconds % 60}s`;
}

export function tokenLabel(token: Address, symbol?: string) {
  if (isNative(token)) return "ETH";
  return symbol || shortAddress(token);
}

export function quoteTrade(
  quantity: bigint,
  pricePerUnit: bigint,
  sellDecimals: number,
  sellFeeBps: bigint,
  buyFeeBps: bigint,
) {
  const scale = 10n ** BigInt(sellDecimals);
  const cost = scale === 0n ? 0n : (quantity * pricePerUnit) / scale;
  const sellFee = (cost * sellFeeBps) / 10_000n;
  const buyFee = (cost * buyFeeBps) / 10_000n;
  return {
    cost,
    sellFee,
    buyFee,
    sellerReceives: cost - sellFee,
    buyerPays: cost + buyFee,
  };
}
