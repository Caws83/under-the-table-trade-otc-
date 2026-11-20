"use client";

import { erc20Abi, type Address } from "viem";
import { useReadContract } from "wagmi";
import { isNative } from "@/lib/config";
import { shortAddress } from "@/lib/format";

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card empty">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {action ? <div className="actions" style={{ justifyContent: "center" }}>{action}</div> : null}
    </div>
  );
}

export function TokenName({ token }: { token: Address }) {
  const native = isNative(token);
  const { data } = useReadContract({
    address: native ? undefined : token,
    abi: erc20Abi,
    functionName: "symbol",
    query: { enabled: !native },
  });
  return <>{native ? "ETH" : data || shortAddress(token)}</>;
}

export function offerStatus(offer: { active: boolean; filled: bigint; escrowed: bigint }) {
  if (offer.active) return "Open";
  if (offer.escrowed > 0n && offer.filled === offer.escrowed) return "Filled";
  return "Cancelled";
}
