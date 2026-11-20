"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatEther } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { factoryAbi } from "@/lib/abi";
import { factoryAddress, payTokenAddress, stakeTokenAddress } from "@/lib/config";
import { useReadyWallet, useSend, useTokenMeta } from "@/lib/hooks";
import { Empty } from "@/components/widgets";
import { chosenToken, TokenChoice } from "@/components/pages/TokenChoice";

const presets = [
  { label: "1 hour", value: 3600n },
  { label: "1 day", value: 86_400n },
  { label: "7 days", value: 604_800n },
  { label: "30 days", value: 2_592_000n },
];

export function CreatePoolView() {
  const router = useRouter();
  const client = usePublicClient();
  const { address } = useAccount();
  const wallet = useReadyWallet();
  const send = useSend();
  const [stakeChoice, setStakeChoice] = useState(stakeTokenAddress ? "stake" : "custom");
  const [rewardChoice, setRewardChoice] = useState(payTokenAddress ? "pay" : "custom");
  const [customStake, setCustomStake] = useState("");
  const [customReward, setCustomReward] = useState("");
  const [duration, setDuration] = useState(3600n);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stakingToken = chosenToken(stakeChoice, customStake);
  const rewardToken = chosenToken(rewardChoice, customReward);
  const stakeMeta = useTokenMeta(stakingToken);
  const rewardMeta = useTokenMeta(rewardToken);
  const fee = useReadContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "creationFee",
    query: { enabled: Boolean(factoryAddress) },
  });

  async function submit() {
    setError("");
    if (!wallet.ensure() || !factoryAddress || !address || !client) return;
    if (!stakingToken || !rewardToken) {
      setError("Choose both a staking token and a rewards token.");
      return;
    }
    setBusy(true);
    try {
      await send({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "createPool",
        args: [stakingToken, rewardToken, duration],
        value: fee.data ?? 0n,
      }, "Pool creation");
      const poolCount = await client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "poolCount" });
      const pool = await client.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "poolAt",
        args: [poolCount - 1n],
      });
      router.push(`/staking/${pool}`);
    } catch {
      setError("The pool was not created.");
    } finally {
      setBusy(false);
    }
  }

  if (!factoryAddress) return <Empty title="Factory address missing" body="Deploy the staking factory before creating a pool." />;

  return (
    <>
      <h1 className="page-title">Create a staking pool</h1>
      <p className="muted">You pay the platform creation fee. Funding rewards is a separate step after the pool exists.</p>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <form className="card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <TokenChoice label="Staking token" choice={stakeChoice} custom={customStake} onChoice={setStakeChoice} onCustom={setCustomStake} allowEth={false} />
          <TokenChoice label="Rewards token" choice={rewardChoice} custom={customReward} onChoice={setRewardChoice} onCustom={setCustomReward} allowEth={false} />
          <div className="field">
            <span>Duration</span>
            <div className="token-picks">
              {presets.map((preset) => (
                <button key={preset.label} type="button" className={`btn small ${duration === preset.value ? "primary" : "ghost"}`} onClick={() => setDuration(preset.value)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Waiting for the wallet…" : `Create pool · ${fee.data !== undefined ? `${formatEther(fee.data)} ETH` : "reading fee"}`}
          </button>
        </form>
        <aside className="card stack">
          <div className="stat-label">What you are opening</div>
          <p>{stakeMeta.symbol || "Staking token"} earns {rewardMeta.symbol || "reward token"}.</p>
          <p className="muted">A one-hour pool is useful on a local fork because rewards accrue every second after you fund them. Longer durations are for a slower schedule.</p>
          <p className="hint">Creation fee is read from the factory. Only the factory owner can change it.</p>
        </aside>
      </div>
    </>
  );
}
