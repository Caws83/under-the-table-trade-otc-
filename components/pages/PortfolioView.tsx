"use client";

import Link from "next/link";
import { formatEther, type Address } from "viem";
import { useAccount, useBalance, useReadContract, useReadContracts } from "wagmi";
import { deskAbi, factoryAbi, poolAbi } from "@/lib/abi";
import { deskAddress, factoryAddress, payTokenAddress, stakeTokenAddress } from "@/lib/config";
import { formatAmount, shortAddress } from "@/lib/format";
import { useErc20Balance, useTokenMeta } from "@/lib/hooks";
import { Empty, TokenName, offerStatus } from "@/components/widgets";

export function PortfolioView() {
  const { address, isConnected } = useAccount();
  const eth = useBalance({ address, query: { enabled: Boolean(address), refetchInterval: 4000 } });
  const stakeBal = useErc20Balance(stakeTokenAddress, address);
  const payBal = useErc20Balance(payTokenAddress, address);
  const offers = useReadContract({
    address: deskAddress,
    abi: deskAbi,
    functionName: "getOffers",
    args: [0n, 50n],
    query: { enabled: Boolean(deskAddress), refetchInterval: 4000 },
  });
  const mine = (offers.data ?? [])
    .map((offer, id) => ({ offer, id }))
    .filter(({ offer }) => address && offer.seller.toLowerCase() === address.toLowerCase());
  const poolCount = useReadContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "poolCount",
    query: { enabled: Boolean(factoryAddress), refetchInterval: 4000 },
  });
  const total = Number(poolCount.data ?? 0n);
  const poolAddresses = useReadContracts({
    contracts: Array.from({ length: total }, (_, index) => ({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "poolAt" as const,
      args: [BigInt(index)] as const,
    })),
    query: { enabled: Boolean(factoryAddress) && total > 0 },
  });
  const pools = (poolAddresses.data ?? []).map((row) => row.result).filter((value): value is Address => Boolean(value));

  if (!isConnected || !address) {
    return <Empty title="Wallet not connected" body="Connect a wallet to see your listings, balances, and staking positions." />;
  }

  return (
    <>
      <h1 className="page-title">Portfolio</h1>
      <p className="muted">{shortAddress(address)}</p>
      <section className="stats">
        <article className="card"><div className="stat-label">ETH</div><div className="stat-value">{eth.data ? Number(formatEther(eth.data.value)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "…"}</div></article>
        <BalanceCard token={stakeTokenAddress} amount={stakeBal.data} label="STAKE" />
        <BalanceCard token={payTokenAddress} amount={payBal.data} label="PAY" />
      </section>
      <div className="section-head"><h2>My listings</h2><Link href="/otc/create">New listing</Link></div>
      {offers.isLoading ? (
        <p className="muted">Reading your listings…</p>
      ) : mine.length === 0 ? (
        <Empty title="No listings from this wallet" body="Listings you create on this desk will show up here." />
      ) : (
        <div className="stack">
          {mine.map(({ offer, id }) => (
            <Link key={id} href={`/otc/${id}`} className="card hoverable spread">
              <span>#{id} · <TokenName token={offer.sellToken as Address} /> / <TokenName token={offer.payToken as Address} /></span>
              <span className={offer.active ? "chip mint" : "chip"}>{offerStatus(offer)}</span>
            </Link>
          ))}
        </div>
      )}
      <div className="section-head"><h2>Staking positions</h2><Link href="/staking">All pools</Link></div>
      {poolCount.isLoading || (total > 0 && poolAddresses.isLoading) ? (
        <p className="muted">Reading staking pools…</p>
      ) : pools.length === 0 ? (
        <Empty title="No pools on this factory" body="Create a pool or wait for one to be deployed." />
      ) : (
        <div className="stack">
          {pools.map((pool) => <Position key={pool} pool={pool} account={address} />)}
        </div>
      )}
    </>
  );
}

function BalanceCard({ token, amount, label }: { token?: Address; amount?: bigint; label: string }) {
  const meta = useTokenMeta(token);
  return (
    <article className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{token && amount !== undefined && meta.decimals !== undefined ? formatAmount(amount, meta.decimals) : "—"}</div>
    </article>
  );
}

function Position({ pool, account }: { pool: Address; account: Address }) {
  const info = useReadContracts({
    contracts: [
      { address: pool, abi: poolAbi, functionName: "stakedBalance", args: [account] },
      { address: pool, abi: poolAbi, functionName: "earned", args: [account] },
      { address: pool, abi: poolAbi, functionName: "creator" },
      { address: pool, abi: poolAbi, functionName: "stakingToken" },
      { address: pool, abi: poolAbi, functionName: "rewardToken" },
    ],
    query: { refetchInterval: 4000 },
  });
  const staked = info.data?.[0].result as bigint | undefined;
  const earned = info.data?.[1].result as bigint | undefined;
  const creator = info.data?.[2].result as Address | undefined;
  const stakingToken = info.data?.[3].result as Address | undefined;
  const rewardToken = info.data?.[4].result as Address | undefined;
  const stakeMeta = useTokenMeta(stakingToken);
  const rewardMeta = useTokenMeta(rewardToken);
  const created = creator?.toLowerCase() === account.toLowerCase();
  const involved = created || (staked ?? 0n) > 0n || (earned ?? 0n) > 0n;
  if (info.isLoading) return <p className="muted">Reading {shortAddress(pool)}…</p>;
  if (!involved) return null;
  const stakedText = staked !== undefined && stakeMeta.decimals !== undefined ? formatAmount(staked, stakeMeta.decimals) : "…";
  const earnedText = earned !== undefined && rewardMeta.decimals !== undefined ? formatAmount(earned, rewardMeta.decimals) : "…";
  return (
    <Link href={`/staking/${pool}`} className="card hoverable spread">
      <span>{stakingToken && rewardToken ? <><TokenName token={stakingToken} /> → <TokenName token={rewardToken} /></> : shortAddress(pool)}</span>
      <span className="muted">{created ? "Creator · " : ""}Staked {stakedText} · Earned {earnedText}</span>
    </Link>
  );
}
