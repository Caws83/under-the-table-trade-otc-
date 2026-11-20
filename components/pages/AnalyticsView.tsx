"use client";

import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { deskAbi, factoryAbi } from "@/lib/abi";
import { deskAddress, factoryAddress, isNative } from "@/lib/config";
import { formatAmount, formatWhen } from "@/lib/format";
import { useTokenMeta } from "@/lib/hooks";
import { Empty, TokenName } from "@/components/widgets";

export function AnalyticsView() {
  const tradesCount = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "tradeCount",
    query: { enabled: Boolean(deskAddress), refetchInterval: 4000 },
  });
  const active = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "activeOfferCount",
    query: { enabled: Boolean(deskAddress), refetchInterval: 4000 },
  });
  const pools = useReadContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "poolCount",
    query: { enabled: Boolean(factoryAddress), refetchInterval: 4000 },
  });
  const count = tradesCount.data ?? 0n;
  const offset = count > 40n ? count - 40n : 0n;
  const trades = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "getTrades",
    args: [offset, 40n],
    query: { enabled: Boolean(deskAddress) && count > 0n, refetchInterval: 4000 },
  });
  const volumeCount = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "volumeTokenCount",
    query: { enabled: Boolean(deskAddress), refetchInterval: 4000 },
  });
  const volumeTokens = useReadContracts({
    contracts: Array.from({ length: Number(volumeCount.data ?? 0n) }, (_, index) => ({
      address: deskAddress,
      abi: deskAbi,
      functionName: "volumeTokenAt" as const,
      args: [BigInt(index)] as const,
    })),
    query: { enabled: Boolean(deskAddress) && Number(volumeCount.data ?? 0n) > 0 },
  });

  return (
    <>
      <h1 className="page-title">Analytics</h1>
      <p className="muted">Counts and volumes read from the desk and factory. Nothing here is estimated in dollars.</p>
      {!deskAddress ? (
        <Empty title="Nothing to measure" body="Analytics stays empty until the local contracts are configured." />
      ) : (
        <>
          <section className="stats">
            <article className="card"><div className="stat-label">Open listings</div><div className="stat-value">{active.data?.toString() ?? "…"}</div></article>
            <article className="card"><div className="stat-label">Trades</div><div className="stat-value">{count.toString()}</div></article>
            <article className="card"><div className="stat-label">Pools</div><div className="stat-value">{factoryAddress ? pools.data?.toString() ?? "…" : "—"}</div></article>
          </section>
          <div className="section-head"><h2>Settlement sequence</h2></div>
          {tradesCount.isLoading ? (
            <p className="muted">Reading settlements…</p>
          ) : !trades.data || trades.data.length === 0 ? (
            <Empty title="No trades yet" body="The chart appears after the first fill. It will not draw sample data." />
          ) : (
            <div className="card">
              <Chart count={trades.data.length} />
              <table className="table">
                <thead><tr><th>When</th><th>Listing</th><th>Payment asset</th><th>Payment</th></tr></thead>
                <tbody>
                  {trades.data.map((trade, index) => (
                    <tr key={`${trade.offerId.toString()}-${index}`}>
                      <td>{formatWhen(Number(trade.timestamp))}</td>
                      <td>#{trade.offerId.toString()}</td>
                      <td><TokenName token={trade.payToken as Address} /></td>
                      <td><PayAmount token={trade.payToken as Address} amount={trade.cost} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="section-head"><h2>Volume and fees by payment asset</h2></div>
          <div className="stack">
            {(volumeTokens.data ?? []).map((row) => {
              const token = row.result as Address | undefined;
              if (!token) return null;
              return <VolumeRow key={token} token={token} />;
            })}
            {(volumeTokens.data ?? []).length === 0 ? <Empty title="No volume yet" body="Fees and volume are recorded when a trade settles." /> : null}
          </div>
        </>
      )}
    </>
  );
}

function Chart({ count }: { count: number }) {
  const width = 640;
  const height = 180;
  const coords = Array.from({ length: count }, (_, index) => {
    const x = count === 1 ? width / 2 : 16 + (index / (count - 1)) * (width - 32);
    const y = height - 20 - (index / Math.max(count - 1, 1)) * (height - 40);
    return { x, y };
  });
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative settlements in the latest window">
      <polyline fill="none" stroke="#7EF2D0" strokeWidth="3" points={coords.map((point) => `${point.x},${point.y}`).join(" ")} />
      {coords.map((point) => <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="5" fill="#63C8FF" />)}
    </svg>
  );
}

function PayAmount({ token, amount }: { token: Address; amount: bigint }) {
  const meta = useTokenMeta(token);
  const decimals = isNative(token) ? 18 : meta.decimals;
  if (decimals === undefined) return <>—</>;
  return <>{formatAmount(amount, decimals)}</>;
}

function VolumeRow({ token }: { token: Address }) {
  const meta = useTokenMeta(token);
  const volume = useReadContract({ address: deskAddress, abi: deskAbi, functionName: "volumeOf", args: [token] });
  const fees = useReadContract({ address: deskAddress, abi: deskAbi, functionName: "feesOf", args: [token] });
  const decimals = isNative(token) ? 18 : meta.decimals;
  return (
    <article className="card spread">
      <strong><TokenName token={token} /></strong>
      <span className="muted">
        Volume {decimals !== undefined && volume.data !== undefined ? formatAmount(volume.data, decimals) : "…"}
        {" · "}
        Fees {decimals !== undefined && fees.data !== undefined ? formatAmount(fees.data, decimals) : "…"}
      </span>
    </article>
  );
}
