"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { deskAbi } from "@/lib/abi";
import { deskAddress } from "@/lib/config";
import { formatAmount, shortAddress } from "@/lib/format";
import { Empty, TokenName, offerStatus } from "@/components/widgets";

export function MarketView() {
  const [query, setQuery] = useState("");
  const offers = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "getOffers",
    args: [0n, 50n],
    query: { enabled: Boolean(deskAddress), refetchInterval: 4000 },
  });
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (offers.data ?? [])
      .map((offer, id) => ({ offer, id }))
      .filter(({ offer }) => {
        if (!needle) return true;
        const haystack = [offer.sellToken, offer.payToken, offer.seller, offer.designatedBuyer].join(" ").toLowerCase();
        return haystack.includes(needle) || (needle === "eth" && (offer.sellToken === "0x0000000000000000000000000000000000000000" || offer.payToken === "0x0000000000000000000000000000000000000000"));
      });
  }, [offers.data, query]);

  return (
    <>
      <div className="section-head">
        <div>
          <h1 className="page-title">OTC desk</h1>
          <p className="muted">Escrowed listings. Partial fills stay open until the remainder is bought or cancelled.</p>
        </div>
        <Link className="btn primary" href="/otc/create">Create listing</Link>
      </div>
      {!deskAddress ? (
        <Empty title="Desk address missing" body="This build has no desk address yet, so there is nothing to list." />
      ) : (
        <>
          <label className="field">
            <span>Filter by asset or address</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ETH, token address, or wallet" />
          </label>
          {offers.isLoading ? <p className="muted">Reading the desk…</p> : null}
          {offers.error ? <p className="error">The desk could not be read. Check that the local chain is running.</p> : null}
          {!offers.isLoading && rows.length === 0 ? (
            <Empty title="No listings match" body="Create a listing or clear the filter. Empty results stay empty." />
          ) : (
            <div className="grid-2">
              <div className="stack">
                {rows.map(({ offer, id }) => (
                  <Link key={id} href={`/otc/${id}`} className="card hoverable">
                    <div className="spread">
                      <strong>#{id} · <TokenName token={offer.sellToken as Address} /> for <TokenName token={offer.payToken as Address} /></strong>
                      <span className={offer.active ? "chip mint" : "chip"}>{offerStatus(offer)}</span>
                    </div>
                    <div className="kv" style={{ marginTop: 10 }}>
                      <span>Remaining</span><b className="mono">{formatAmount(offer.escrowed - offer.filled, offer.sellDecimals)}</b>
                      <span>Price / token</span><b className="mono">{formatAmount(offer.pricePerUnit, offer.payDecimals)}</b>
                      <span>Seller</span><b>{shortAddress(offer.seller)}</b>
                    </div>
                  </Link>
                ))}
              </div>
              <aside className="card stack">
                <div className="stat-label">Settlement</div>
                <p>The seller fee comes out of the payment. The buyer fee is added on top. Both are capped at 0.30% and checked again inside the transaction.</p>
                <p className="muted">Showing the latest 50 listings stored on the desk.</p>
              </aside>
            </div>
          )}
        </>
      )}
    </>
  );
}
