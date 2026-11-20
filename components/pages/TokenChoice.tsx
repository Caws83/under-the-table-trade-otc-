"use client";

import { payTokenAddress, stakeTokenAddress } from "@/lib/config";
import { parseAddress } from "@/lib/hooks";
import type { Address } from "viem";

export type TokenChoiceId = "stake" | "pay" | "custom";

export function chosenToken(choice: string, custom: string): Address | undefined {
  if (choice === "stake") return stakeTokenAddress;
  if (choice === "pay") return payTokenAddress;
  return parseAddress(custom);
}

export function TokenChoice({
  label, choice, custom, onChoice, onCustom, allowEth = false,
}: {
  label: string;
  choice: string;
  custom: string;
  onChoice: (choice: TokenChoiceId) => void;
  onCustom: (value: string) => void;
  allowEth?: boolean;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="token-picks">
        {stakeTokenAddress ? <button type="button" className={`btn small ${choice === "stake" ? "primary" : "ghost"}`} onClick={() => onChoice("stake")}>STAKE</button> : null}
        {payTokenAddress ? <button type="button" className={`btn small ${choice === "pay" ? "primary" : "ghost"}`} onClick={() => onChoice("pay")}>PAY</button> : null}
        <button type="button" className={`btn small ${choice === "custom" ? "primary" : "ghost"}`} onClick={() => onChoice("custom")}>Custom</button>
        {allowEth ? null : null}
      </div>
      {choice === "custom" ? <input value={custom} onChange={(event) => onCustom(event.target.value)} placeholder="Token address" /> : null}
    </div>
  );
}
