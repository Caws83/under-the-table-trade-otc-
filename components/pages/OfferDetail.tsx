"use client";

import { useState } from "react";
import { erc20Abi, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { deskAbi } from "@/lib/abi";
import { deskAddress, isNative } from "@/lib/config";
import { formatAmount, parseAmount, shortAddress } from "@/lib/format";
import { useAllowance, useReadyWallet, useSend, useTokenMeta } from "@/lib/hooks";
import { Empty, TokenName, offerStatus } from "@/components/widgets";

export function OfferDetail({ id }: { id: string }) {
  const numeric = /^\d+$/.test(id) ? BigInt(id) : undefined;
  const { address } = useAccount();
  const wallet = useReadyWallet();
  const send = useSend();
  const [quantityText, setQuantityText] = useState("");
  const [priceText, setPriceText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const offerRead = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "getOffer",
    args: numeric !== undefined ? [numeric] : undefined,
    query: { enabled: Boolean(deskAddress && numeric !== undefined), refetchInterval: 3000 },
  });
  const fees = useReadContract({ address: deskAddress, abi: deskAbi, functionName: "sellFeeBps", query: { enabled: Boolean(deskAddress) } });
  const buyFees = useReadContract({ address: deskAddress, abi: deskAbi, functionName: "buyFeeBps", query: { enabled: Boolean(deskAddress) } });
  const offer = offerRead.data;
  const sellMeta = useTokenMeta(offer?.sellToken as Address | undefined);
  const payMeta = useTokenMeta(offer?.payToken as Address | undefined);
  const quantity = offer && parseAmount(quantityText, offer.sellDecimals);
  const quote = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "quote",
    args: numeric !== undefined && quantity ? [numeric, quantity] : undefined,
    query: { enabled: Boolean(deskAddress && numeric !== undefined && quantity) },
  });
  const allowance = useAllowance(offer?.payToken as Address | undefined, address, deskAddress);

  if (!deskAddress) return <Empty title="Desk address missing" body="Deploy the local desk to open a listing." />;
  if (numeric === undefined) return <Empty title="Unknown listing" body="That listing id is not a number." />;
  if (offerRead.isLoading) return <p className="muted">Reading listing #{id}…</p>;
  if (!offer) return <Empty title="Listing not found" body="The desk does not have an offer with this id." />;

  const remaining = offer.escrowed - offer.filled;
  const mine = address?.toLowerCase() === offer.seller.toLowerCase();

  async function fill() {
    setError("");
    if (!wallet.ensure() || !deskAddress || !offer || !quantity || numeric === undefined || !quote.data) return;
    if (quantity > remaining) {
      setError("That amount is larger than the remaining escrow.");
      return;
    }
    setBusy(true);
    try {
      const buyerPays = quote.data ? quote.data[4] : 0n;
      if (!isNative(offer.payToken) && (allowance.data ?? 0n) < buyerPays) {
        await send({ address: offer.payToken, abi: erc20Abi, functionName: "approve", args: [deskAddress, buyerPays] }, "Payment approval");
      }
      await send({
        address: deskAddress,
        abi: deskAbi,
        functionName: "fill",
        args: [numeric, quantity, offer.pricePerUnit, fees.data ?? 0n, buyFees.data ?? 0n],
        value: isNative(offer.payToken) ? buyerPays : 0n,
      }, "Fill");
      setQuantityText("");
    } catch {
      setError("The fill did not settle.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!wallet.ensure() || !deskAddress || numeric === undefined) return;
    setBusy(true);
    try {
      await send({ address: deskAddress, abi: deskAbi, functionName: "cancel", args: [numeric] }, "Cancellation");
    } finally {
      setBusy(false);
    }
  }

  async function adjust() {
    if (!wallet.ensure() || !deskAddress || !offer || numeric === undefined || payMeta.decimals === undefined) return;
    const next = parseAmount(priceText, payMeta.decimals);
    if (!next) {
      setError("Enter a new price per whole token.");
      return;
    }
    setBusy(true);
    try {
      await send({ address: deskAddress, abi: deskAbi, functionName: "adjustPrice", args: [numeric, next] }, "Price update");
      setPriceText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="spread">
        <h1 className="page-title">Listing #{id}</h1>
        <span className={offer.active ? "chip mint" : "chip"}>{offerStatus(offer)}</span>
      </div>
      <div className="grid-2">
        <section className="card stack">
          <div className="kv">
            <span>Selling</span><b><TokenName token={offer.sellToken as Address} /></b>
            <span>Paying with</span><b><TokenName token={offer.payToken as Address} /></b>
            <span>Remaining</span><b className="mono">{formatAmount(remaining, offer.sellDecimals)} {sellMeta.symbol}</b>
            <span>Filled</span><b className="mono">{formatAmount(offer.filled, offer.sellDecimals)}</b>
            <span>Price / token</span><b className="mono">{formatAmount(offer.pricePerUnit, offer.payDecimals)} {payMeta.symbol}</b>
            <span>Seller</span><b>{shortAddress(offer.seller)}</b>
            <span>Buyer</span><b>{offer.designatedBuyer === "0x0000000000000000000000000000000000000000" ? "Anyone" : shortAddress(offer.designatedBuyer)}</b>
            <span>Whole fill</span><b>{offer.wholeFill ? "Required" : "Partial fills allowed"}</b>
          </div>
        </section>
        <section className="card">
          {offer.active ? (
            <>
              <label className="field">
                <span>Quantity to buy</span>
                <input value={quantityText} onChange={(event) => setQuantityText(event.target.value)} inputMode="decimal" placeholder={formatAmount(remaining, offer.sellDecimals)} />
              </label>
              {quote.data && payMeta.decimals !== undefined ? (
                <div className="kv">
                  <span>You pay</span><b className="mono">{formatAmount(quote.data[4], payMeta.decimals)} {payMeta.symbol}</b>
                  <span>Seller receives</span><b className="mono">{formatAmount(quote.data[3], payMeta.decimals)}</b>
                  <span>Fees</span><b className="mono">{formatAmount(quote.data[1] + quote.data[2], payMeta.decimals)}</b>
                </div>
              ) : <p className="hint">Enter a quantity to read the on-chain quote.</p>}
              {error ? <p className="error">{error}</p> : null}
              <div className="actions" style={{ marginTop: 12 }}>
                <button className="btn primary" type="button" disabled={busy} onClick={() => void fill()}>Fill</button>
                {mine ? <button className="btn danger" type="button" disabled={busy} onClick={() => void cancel()}>Cancel remainder</button> : null}
              </div>
              {mine ? (
                <div style={{ marginTop: 16 }}>
                  <label className="field">
                    <span>New price per token</span>
                    <input value={priceText} onChange={(event) => setPriceText(event.target.value)} inputMode="decimal" />
                  </label>
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => void adjust()}>Update price</button>
                </div>
              ) : null}
            </>
          ) : (
            <Empty title="This listing is closed" body="Closed listings keep their history. The remaining escrow has already been settled or returned." />
          )}
        </section>
      </div>
    </>
  );
}
