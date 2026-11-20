"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { deskAbi, factoryAbi } from "@/lib/abi";
import { deskAddress, factoryAddress } from "@/lib/config";
import { Empty, TokenName, offerStatus } from "@/components/widgets";
import { formatAmount } from "@/lib/format";
import type { Address } from "viem";

export function HomeView() {
  const offers = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "getOffers",
    args: [0n, 50n],
    query: { enabled: Boolean(deskAddress), refetchInterval: 4000 },
  });
  const active = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "activeOfferCount",
    query: { enabled: Boolean(deskAddress), refetchInterval: 4000 },
  });
  const trades = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "tradeCount",
    query: { enabled: Boolean(deskAddress), refetchInterval: 4000 },
  });
  const pools = useReadContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "poolCount",
    query: { enabled: Boolean(factoryAddress), refetchInterval: 4000 },
  });
  const open = (offers.data ?? [])
    .map((offer, id) => ({ offer, id }))
    .filter((item) => item.offer.active)
    .slice(0, 3);

  return (
    <>
      <section className="hero">
        <div>
          <p className="chip mint">Robinhood Chain · 4663</p>
          <h1>Private deals. Open markets.</h1>
          <p className="lede">
            Escrow an asset, set the price, and let a counterparty fill any part of it. When you want that inventory to earn, open a staking pool and fund the rewards yourself.
          </p>
          <div className="actions" style={{ marginTop: 18 }}>
            <Link className="btn primary" href="/otc">Browse the desk</Link>
            <Link className="btn ghost" href="/staking">Open staking</Link>
          </div>
        </div>
        <div className="card stack">
          <div>
            <div className="stat-label">How a deal settles</div>
            <p>The sold asset stays in escrow. A fill pays the seller, routes the fee, and delivers the asset in one transaction.</p>
          </div>
          <div>
            <div className="stat-label">How a pool pays</div>
            <p>Stakers keep their principal. The creator can add rewards and extend the schedule, and cannot withdraw someone else&apos;s stake.</p>
          </div>
        </div>
      </section>
      <section className="stats">
        <article className="card"><div className="stat-label">Open listings</div><div className="stat-value">{deskAddress ? (active.data?.toString() ?? "…") : "—"}</div></article>
        <article className="card"><div className="stat-label">Settled trades</div><div className="stat-value">{deskAddress ? (trades.data?.toString() ?? "…") : "—"}</div></article>
        <article className="card"><div className="stat-label">Staking pools</div><div className="stat-value">{factoryAddress ? (pools.data?.toString() ?? "…") : "—"}</div></article>
      </section>
      <div className="section-head">
        <h2>Live listings</h2>
        <Link href="/otc/create">Create a listing</Link>
      </div>
      {!deskAddress ? (
        <Empty title="The desk is not connected" body="Deploy the local contracts and set the desk address. This page will not invent listings." />
      ) : offers.isLoading ? (
        <p className="muted">Reading listings from the desk…</p>
      ) : open.length === 0 ? (
        <Empty title="No open listings" body="The desk has no active offers right now." action={<Link className="btn primary" href="/otc/create">Create the first listing</Link>} />
      ) : (
        <div className="grid-3">
          {open.map(({ offer, id }) => (
            <Link key={id} href={`/otc/${id}`} className="card hoverable stack">
              <div className="spread">
                <strong><TokenName token={offer.sellToken as Address} /> / <TokenName token={offer.payToken as Address} /></strong>
                <span className="chip mint">{offerStatus(offer)}</span>
              </div>
              <div className="muted">Remaining {formatAmount(offer.escrowed - offer.filled, offer.sellDecimals)}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
