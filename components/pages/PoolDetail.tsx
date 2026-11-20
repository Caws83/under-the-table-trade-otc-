"use client";

import { useState } from "react";
import { erc20Abi, isAddress, type Address } from "viem";
import { useAccount, useBlock, useReadContract, useReadContracts } from "wagmi";
import { factoryAbi, poolAbi } from "@/lib/abi";
import { factoryAddress } from "@/lib/config";
import { formatAmount, formatDuration, parseAmount, shortAddress } from "@/lib/format";
import { explain, useAllowance, useReadyWallet, useSend, useTokenMeta } from "@/lib/hooks";
import { Empty, TokenName } from "@/components/widgets";

export function PoolDetail({ pool }: { pool: string }) {
  const valid = isAddress(pool);
  const address = valid ? (pool as Address) : undefined;
  const { address: account } = useAccount();
  const wallet = useReadyWallet();
  const send = useSend();
  const block = useBlock({ query: { refetchInterval: 2000 } });
  const [stakeText, setStakeText] = useState("");
  const [withdrawText, setWithdrawText] = useState("");
  const [fundText, setFundText] = useState("");
  const [renewAmount, setRenewAmount] = useState("");
  const [renewHours, setRenewHours] = useState("1");
  const [emergency, setEmergency] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const info = useReadContracts({
    contracts: address
      ? [
          { address, abi: poolAbi, functionName: "stakingToken" },
          { address, abi: poolAbi, functionName: "rewardToken" },
          { address, abi: poolAbi, functionName: "creator" },
          { address, abi: poolAbi, functionName: "duration" },
          { address, abi: poolAbi, functionName: "rewardRate" },
          { address, abi: poolAbi, functionName: "periodFinish" },
          { address, abi: poolAbi, functionName: "totalStaked" },
          { address, abi: poolAbi, functionName: "reservedRewards" },
          { address, abi: poolAbi, functionName: "rewardSurplus" },
        ]
      : [],
    query: { enabled: Boolean(address), refetchInterval: 3000 },
  });
  const stakingToken = info.data?.[0]?.result as Address | undefined;
  const rewardToken = info.data?.[1]?.result as Address | undefined;
  const creator = info.data?.[2]?.result as Address | undefined;
  const duration = info.data?.[3]?.result as bigint | undefined;
  const rate = info.data?.[4]?.result as bigint | undefined;
  const finish = info.data?.[5]?.result as bigint | undefined;
  const totalStaked = info.data?.[6]?.result as bigint | undefined;
  const reserved = info.data?.[7]?.result as bigint | undefined;
  const surplus = info.data?.[8]?.result as bigint | undefined;
  const stakeMeta = useTokenMeta(stakingToken);
  const rewardMeta = useTokenMeta(rewardToken);
  const position = useReadContract({
    address,
    abi: poolAbi,
    functionName: "stakedBalance",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(address && account), refetchInterval: 3000 },
  });
  const earned = useReadContract({
    address,
    abi: poolAbi,
    functionName: "earned",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(address && account), refetchInterval: 2000 },
  });
  const renewal = useReadContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "renewalFee",
    query: { enabled: Boolean(factoryAddress) },
  });
  const stakeAllowance = useAllowance(stakingToken, account, address);
  const rewardAllowance = useAllowance(rewardToken, account, address);

  if (!valid || !address) return <Empty title="Unknown pool" body="That address is not a pool address." />;
  if (info.isLoading) return <p className="muted">Reading pool accounting…</p>;
  if (!stakingToken || !rewardToken || !creator) return <Empty title="Pool not readable" body="This address did not return staking pool data." />;

  const now = Number(block.data?.timestamp ?? 0n);
  const finishAt = Number(finish ?? 0n);
  const mine = account?.toLowerCase() === creator.toLowerCase();
  const stakeDecimals = stakeMeta.decimals ?? 18;
  const rewardDecimals = rewardMeta.decimals ?? 18;

  async function run(work: () => Promise<void>) {
    setError("");
    if (!wallet.ensure()) return;
    setBusy(true);
    try {
      await work();
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="spread">
        <div>
          <h1 className="page-title"><TokenName token={stakingToken} /> staking</h1>
          <p className="muted">Rewards are paid in <TokenName token={rewardToken} />. Creator {shortAddress(creator)}.</p>
        </div>
        <span className={finishAt > now ? "chip mint" : "chip"}>{finishAt === 0 ? "Unfunded" : finishAt > now ? "Live" : "Ended"}</span>
      </div>
      <section className="stats">
        <article className="card"><div className="stat-label">Total staked</div><div className="stat-value">{formatAmount(totalStaked ?? 0n, stakeDecimals)}</div></article>
        <article className="card"><div className="stat-label">Your stake</div><div className="stat-value">{formatAmount(position.data ?? 0n, stakeDecimals)}</div></article>
        <article className="card"><div className="stat-label">Your earned rewards</div><div className="stat-value">{formatAmount(earned.data ?? 0n, rewardDecimals)}</div></article>
      </section>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Stake, withdraw, claim</h2>
          <label className="field"><span>Stake amount</span><input value={stakeText} onChange={(event) => setStakeText(event.target.value)} inputMode="decimal" /></label>
          <div className="actions">
            <button className="btn primary" type="button" disabled={busy} onClick={() => void run(async () => {
              const amount = parseAmount(stakeText, stakeDecimals);
              if (!amount) throw new Error("Enter a stake amount.");
              if ((stakeAllowance.data ?? 0n) < amount) {
                await send({ address: stakingToken, abi: erc20Abi, functionName: "approve", args: [address, amount] }, "Stake approval");
              }
              await send({ address, abi: poolAbi, functionName: "stake", args: [amount] }, "Stake");
              setStakeText("");
            })}>Stake</button>
          </div>
          <label className="field"><span>Withdraw amount</span><input value={withdrawText} onChange={(event) => setWithdrawText(event.target.value)} inputMode="decimal" /></label>
          <div className="actions">
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void run(async () => {
              const amount = parseAmount(withdrawText, stakeDecimals);
              if (!amount) throw new Error("Enter a withdrawal amount.");
              await send({ address, abi: poolAbi, functionName: "withdraw", args: [amount] }, "Withdrawal");
              setWithdrawText("");
            })}>Withdraw</button>
            <button className="btn sky" type="button" disabled={busy} onClick={() => void run(async () => {
              await send({ address, abi: poolAbi, functionName: "claim" }, "Reward claim");
            })}>Claim rewards</button>
          </div>
          <label className="check" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={emergency} onChange={(event) => setEmergency(event.target.checked)} />
            Emergency withdrawal returns my principal and leaves accrued rewards claimable.
          </label>
          <button className="btn danger" type="button" disabled={busy || !emergency} onClick={() => void run(async () => {
            await send({ address, abi: poolAbi, functionName: "emergencyWithdraw" }, "Emergency withdrawal");
            setEmergency(false);
          })}>Emergency withdraw</button>
          {error ? <p className="error">{error}</p> : null}
        </section>
        <section className="card stack">
          <div className="stat-label">Live accounting</div>
          <div className="kv">
            <span>Reward rate</span><b className="mono">{formatAmount(rate ?? 0n, rewardDecimals)} / sec</b>
            <span>Time left</span><b>{finishAt === 0 ? "Not started" : formatDuration(finishAt - now)}</b>
            <span>Reserved rewards</span><b className="mono">{formatAmount(reserved ?? 0n, rewardDecimals)}</b>
            <span>Unallocated surplus</span><b className="mono">{formatAmount(surplus ?? 0n, rewardDecimals)}</b>
            <span>Base duration</span><b>{duration ? formatDuration(Number(duration)) : "—"}</b>
            <span>Renewal fee</span><b>{renewal.data !== undefined ? `${formatAmount(renewal.data, 18)} ETH` : "…"}</b>
          </div>
          {mine ? (
            <>
              <h2>Creator tools</h2>
              <label className="field"><span>Fund additional rewards</span><input value={fundText} onChange={(event) => setFundText(event.target.value)} inputMode="decimal" /></label>
              <button className="btn primary" type="button" disabled={busy} onClick={() => void run(async () => {
                const amount = parseAmount(fundText, rewardDecimals);
                if (!amount) throw new Error("Enter a reward amount.");
                if ((rewardAllowance.data ?? 0n) < amount) {
                  await send({ address: rewardToken, abi: erc20Abi, functionName: "approve", args: [address, amount] }, "Reward approval");
                }
                await send({ address, abi: poolAbi, functionName: "fund", args: [amount] }, "Reward funding");
                setFundText("");
              })}>Fund rewards</button>
              <label className="field"><span>Renewal length in hours</span><input value={renewHours} onChange={(event) => setRenewHours(event.target.value)} inputMode="numeric" /></label>
              <label className="field"><span>Additional rewards for the renewal</span><input value={renewAmount} onChange={(event) => setRenewAmount(event.target.value)} inputMode="decimal" placeholder="0 to extend with rewards already scheduled" /></label>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => void run(async () => {
                const hours = Number(renewHours);
                if (!Number.isFinite(hours) || hours <= 0) throw new Error("Enter a renewal length.");
                const seconds = BigInt(Math.floor(hours * 3600));
                const extra = renewAmount.trim() ? parseAmount(renewAmount, rewardDecimals) : 0n;
                if (extra === null) throw new Error("Enter a valid additional reward.");
                if (extra > 0n && (rewardAllowance.data ?? 0n) < extra) {
                  await send({ address: rewardToken, abi: erc20Abi, functionName: "approve", args: [address, extra] }, "Reward approval");
                }
                await send({
                  address,
                  abi: poolAbi,
                  functionName: "renew",
                  args: [seconds, extra],
                  value: renewal.data ?? 0n,
                }, "Renewal");
              })}>Renew pool</button>
            </>
          ) : <p className="muted">Pool management is available to the creator wallet.</p>}
        </section>
      </div>
    </>
  );
}
