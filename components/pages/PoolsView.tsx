"use client";

import Link from "next/link";
import { useBlock, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { factoryAbi, poolAbi } from "@/lib/abi";
import { factoryAddress } from "@/lib/config";
import { formatAmount, formatDuration, shortAddress } from "@/lib/format";
import { useTokenMeta } from "@/lib/hooks";
import { Empty, TokenName } from "@/components/widgets";

export function PoolsView() {
  const count = useReadContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "poolCount",
    query: { enabled: Boolean(factoryAddress), refetchInterval: 4000 },
  });
  const total = Number(count.data ?? 0n);
  const addresses = useReadContracts({
    contracts: Array.from({ length: total }, (_, index) => ({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "poolAt",
      args: [BigInt(index)],
    })),
    query: { enabled: Boolean(factoryAddress) && total > 0, refetchInterval: 4000 },
  });
  const pools = (addresses.data ?? []).map((row) => row.result).filter((value): value is Address => Boolean(value));

  return (
    <>
      <div className="section-head">
        <div>
          <h1 className="page-title">Staking pools</h1>
          <p className="muted">Public pools. Creators fund rewards. Stakers keep their principal.</p>
        </div>
        <Link className="btn primary" href="/staking/create">Create a pool</Link>
      </div>
      {!factoryAddress ? (
        <Empty title="Factory address missing" body="Deploy the staking factory locally to discover pools." />
      ) : count.isLoading ? (
        <p className="muted">Reading pools…</p>
      ) : pools.length === 0 ? (
        <Empty title="No pools yet" body="Nobody has created a staking pool on this deployment." action={<Link className="btn primary" href="/staking/create">Create a pool</Link>} />
      ) : (
        <div className="grid-3">
          {pools.map((pool) => <PoolCard key={pool} pool={pool} />)}
        </div>
      )}
    </>
  );
}

function PoolCard({ pool }: { pool: Address }) {
  const block = useBlock({ query: { refetchInterval: 4000 } });
  const info = useReadContracts({
    contracts: [
      { address: pool, abi: poolAbi, functionName: "stakingToken" },
      { address: pool, abi: poolAbi, functionName: "rewardToken" },
      { address: pool, abi: poolAbi, functionName: "totalStaked" },
      { address: pool, abi: poolAbi, functionName: "periodFinish" },
      { address: pool, abi: poolAbi, functionName: "creator" },
    ],
    query: { refetchInterval: 4000 },
  });
  const stakingToken = info.data?.[0].result as Address | undefined;
  const rewardToken = info.data?.[1].result as Address | undefined;
  const staked = info.data?.[2].result as bigint | undefined;
  const finish = Number(info.data?.[3].result ?? 0n);
  const creator = info.data?.[4].result as Address | undefined;
  const stakeMeta = useTokenMeta(stakingToken);
  const now = Number(block.data?.timestamp ?? 0n);
  const live = finish > now;

  return (
    <Link href={`/staking/${pool}`} className="card hoverable stack">
      <div className="spread">
        <strong>{stakingToken && rewardToken ? <><TokenName token={stakingToken} /> → <TokenName token={rewardToken} /></> : "Reading pool…"}</strong>
        <span className={live ? "chip mint" : "chip"}>{finish === 0 ? "Unfunded" : live ? "Live" : "Ended"}</span>
      </div>
      <div className="kv">
        <span>Staked</span><b className="mono">{staked !== undefined && stakeMeta.decimals !== undefined ? formatAmount(staked, stakeMeta.decimals) : "…"}</b>
        <span>Time left</span><b>{finish === 0 ? "—" : formatDuration(finish - now)}</b>
        <span>Creator</span><b>{creator ? shortAddress(creator) : "…"}</b>
      </div>
    </Link>
  );
}
