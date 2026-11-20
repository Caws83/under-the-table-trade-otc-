"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { erc20Abi, isAddress, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { deskAbi } from "@/lib/abi";
import { NATIVE, deskAddress, isNative, payTokenAddress, stakeTokenAddress } from "@/lib/config";
import { formatAmount, parseAmount, quoteTrade } from "@/lib/format";
import { parseAddress, useAllowance, useReadyWallet, useSend, useTokenMeta } from "@/lib/hooks";
import { Empty } from "@/components/widgets";

type Choice = "eth" | "stake" | "pay" | "custom";

function chosen(choice: Choice, custom: string): Address | undefined {
  if (choice === "eth") return NATIVE;
  if (choice === "stake") return stakeTokenAddress;
  if (choice === "pay") return payTokenAddress;
  return parseAddress(custom);
}

export function CreateOfferView() {
  const router = useRouter();
  const client = usePublicClient();
  const { address } = useAccount();
  const wallet = useReadyWallet();
  const send = useSend();
  const [sellChoice, setSellChoice] = useState<Choice>(stakeTokenAddress ? "stake" : "eth");
  const [payChoice, setPayChoice] = useState<Choice>("eth");
  const [customSell, setCustomSell] = useState("");
  const [customPay, setCustomPay] = useState("");
  const [amountText, setAmountText] = useState("");
  const [priceText, setPriceText] = useState("");
  const [buyerText, setBuyerText] = useState("");
  const [wholeFill, setWholeFill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sellToken = chosen(sellChoice, customSell);
  const payToken = chosen(payChoice, customPay);
  const sellMeta = useTokenMeta(sellToken);
  const payMeta = useTokenMeta(payToken);
  const fees = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "sellFeeBps",
    query: { enabled: Boolean(deskAddress) },
  });
  const buyFees = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "buyFeeBps",
    query: { enabled: Boolean(deskAddress) },
  });
  const allowance = useAllowance(sellToken, address, deskAddress);

  const amount = sellMeta.decimals !== undefined ? parseAmount(amountText, sellMeta.decimals) : null;
  const price = payMeta.decimals !== undefined ? parseAmount(priceText, payMeta.decimals) : null;
  const preview = amount && price && sellMeta.decimals !== undefined
    ? quoteTrade(amount, price, sellMeta.decimals, fees.data ?? 0n, buyFees.data ?? 0n)
    : null;

  async function submit() {
    setError("");
    if (!wallet.ensure() || !deskAddress || !address || !client || !sellToken || !payToken) return;
    if (sellToken.toLowerCase() === payToken.toLowerCase()) {
      setError("The sold asset and the payment asset have to be different.");
      return;
    }
    if (!amount || !price) {
      setError("Enter a valid amount and a price per whole token.");
      return;
    }
    if (buyerText.trim() && !isAddress(buyerText.trim())) {
      setError("The designated buyer is not a valid address.");
      return;
    }
    setBusy(true);
    try {
      if (!isNative(sellToken) && (allowance.data ?? 0n) < amount) {
        await send({ address: sellToken, abi: erc20Abi, functionName: "approve", args: [deskAddress, amount] }, "Escrow approval");
      }
      await send({
        address: deskAddress,
        abi: deskAbi,
        functionName: "createOffer",
        args: [sellToken, payToken, amount, price, buyerText.trim() ? (buyerText.trim() as Address) : NATIVE, wholeFill],
        value: isNative(sellToken) ? amount : 0n,
      }, "Listing");
      const nextCount = await client.readContract({ address: deskAddress, abi: deskAbi, functionName: "offerCount" });
      router.push(`/otc/${(nextCount - 1n).toString()}`);
    } catch {
      setError("The listing was not created.");
    } finally {
      setBusy(false);
    }
  }

  if (!deskAddress) return <Empty title="Desk address missing" body="Deploy the local desk before creating a listing." />;

  return (
    <>
      <h1 className="page-title">Create a listing</h1>
      <p className="muted">The sold asset is escrowed immediately. Price is the payment for one whole token.</p>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <form className="card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <AssetPicker label="Asset you escrow" choice={sellChoice} custom={customSell} onChoice={setSellChoice} onCustom={setCustomSell} />
          <AssetPicker label="Asset the buyer pays" choice={payChoice} custom={customPay} onChoice={setPayChoice} onCustom={setCustomPay} />
          <label className="field">
            <span>Amount</span>
            <input value={amountText} onChange={(event) => setAmountText(event.target.value)} inputMode="decimal" placeholder="0.0" />
          </label>
          <label className="field">
            <span>Price per 1 {sellMeta.symbol || "token"}</span>
            <input value={priceText} onChange={(event) => setPriceText(event.target.value)} inputMode="decimal" placeholder={`0.0 ${payMeta.symbol || ""}`} />
          </label>
          <label className="field">
            <span>Designated buyer, optional</span>
            <input value={buyerText} onChange={(event) => setBuyerText(event.target.value)} placeholder="Leave empty for a public listing" />
          </label>
          <label className="check">
            <input type="checkbox" checked={wholeFill} onChange={(event) => setWholeFill(event.target.checked)} />
            Require the buyer to take the entire remaining amount
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 14 }}>
            {busy ? "Waiting for the wallet…" : "Create listing"}
          </button>
        </form>
        <aside className="card stack">
          <div className="stat-label">Quote for the full amount</div>
          {preview && payMeta.decimals !== undefined ? (
            <div className="kv">
              <span>Payment</span><b className="mono">{formatAmount(preview.cost, payMeta.decimals)} {payMeta.symbol}</b>
              <span>Seller fee</span><b className="mono">{formatAmount(preview.sellFee, payMeta.decimals)}</b>
              <span>Buyer fee</span><b className="mono">{formatAmount(preview.buyFee, payMeta.decimals)}</b>
              <span>Seller receives</span><b className="mono">{formatAmount(preview.sellerReceives, payMeta.decimals)}</b>
              <span>Buyer pays</span><b className="mono">{formatAmount(preview.buyerPays, payMeta.decimals)}</b>
            </div>
          ) : <p className="muted">Enter an amount and a price to preview the settlement.</p>}
          <p className="hint">Current fees: {fees.data?.toString() ?? "…"} bps seller, {buyFees.data?.toString() ?? "…"} bps buyer. The fill transaction rejects a fee higher than the buyer allows.</p>
        </aside>
      </div>
    </>
  );
}

function AssetPicker({
  label, choice, custom, onChoice, onCustom,
}: {
  label: string;
  choice: Choice;
  custom: string;
  onChoice: (choice: Choice) => void;
  onCustom: (value: string) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="token-picks">
        <button type="button" className={`btn small ${choice === "eth" ? "primary" : "ghost"}`} onClick={() => onChoice("eth")}>ETH</button>
        {stakeTokenAddress ? <button type="button" className={`btn small ${choice === "stake" ? "primary" : "ghost"}`} onClick={() => onChoice("stake")}>STAKE</button> : null}
        {payTokenAddress ? <button type="button" className={`btn small ${choice === "pay" ? "primary" : "ghost"}`} onClick={() => onChoice("pay")}>PAY</button> : null}
        <button type="button" className={`btn small ${choice === "custom" ? "primary" : "ghost"}`} onClick={() => onChoice("custom")}>Custom</button>
      </div>
      {choice === "custom" ? <input value={custom} onChange={(event) => onCustom(event.target.value)} placeholder="Token address" /> : null}
    </div>
  );
}
