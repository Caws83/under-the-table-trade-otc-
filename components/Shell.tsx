"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { formatEther } from "viem";
import { explorerAddress, isLocalRpc, robinhood, robinhoodTestnet } from "@/lib/chain";
import { devMode } from "@/lib/config";
import { devAccounts, selectDevAccount, type DevAccountId } from "@/lib/localWallet";
import { shortAddress } from "@/lib/format";
import { useToast } from "./Toast";

const links = [
  ["/", "Overview"],
  ["/otc", "OTC"],
  ["/staking", "Staking"],
  ["/portfolio", "Portfolio"],
  ["/analytics", "Analytics"],
  ["/docs", "Docs"],
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const balance = useBalance({ address, query: { enabled: Boolean(address), refetchInterval: 5000 } });
  const toast = useToast();
  const accounts = devMode ? devAccounts() : null;
  const link = address ? explorerAddress(address, chainId) : null;

  async function connectLocal(id: DevAccountId) {
    const local = connectors.find((item) => item.id === "utc-local");
    if (!local) {
      toast.push("The local development wallet is not enabled.", "err");
      return;
    }
    selectDevAccount(id);
    if (isConnected) await disconnectAsync();
    await connectAsync({ connector: local, chainId: robinhood.id });
    toast.push(`Using local account ${id} on the Robinhood fork.`, "ok");
  }

  async function useInjected() {
    const injected = connectors.find((item) => item.type === "injected" || item.id === "injected");
    if (!injected) {
      toast.push("No injected wallet was found in this browser.", "err");
      return;
    }
    await connectAsync({ connector: injected });
  }

  async function changeChain(id: typeof robinhood.id | typeof robinhoodTestnet.id) {
    try {
      await switchChainAsync({ chainId: id });
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "The wallet could not switch networks.", "err");
    }
  }

  return (
    <div className="app">
      <header className="header">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          {/* Local brand mark. It is an SVG, so the image optimizer is not used. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={36} height={36} />
          <div>
            <strong>Under The Counter</strong>
            <span>Private deals. Open markets.</span>
          </div>
        </Link>
        <button className="btn ghost small nav-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          Menu
        </button>
        <nav className={open ? "nav open" : "nav"}>
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "active" : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <button className={`btn small ${chainId === robinhood.id ? "primary" : "ghost"}`} type="button" onClick={() => changeChain(robinhood.id)}>
            Robinhood
          </button>
          <button className={`btn small ${chainId === robinhoodTestnet.id ? "primary" : "ghost"}`} type="button" onClick={() => changeChain(robinhoodTestnet.id)}>
            Testnet
          </button>
          {accounts ? (
            <>
              <button className="btn small ghost" type="button" onClick={() => connectLocal("A")}>Local A</button>
              <button className="btn small ghost" type="button" onClick={() => connectLocal("B")}>Local B</button>
            </>
          ) : null}
          {isConnected ? (
            <button className="btn small sky" type="button" onClick={() => disconnectAsync()}>
              {shortAddress(address || "")}
            </button>
          ) : (
            <button className="btn small primary" type="button" onClick={useInjected}>Connect wallet</button>
          )}
        </div>
      </header>
      <main className="main">
        {isLocalRpc() ? (
          <div className="banner">Local Robinhood fork. Figures on this screen come from the node at this machine, not from Robinhood Chain mainnet.</div>
        ) : null}
        {devMode ? (
          <div className="banner warn">Local development wallet is enabled. It signs only while the RPC host is localhost, using Foundry&apos;s public Anvil accounts.</div>
        ) : null}
        {isConnected && chainId && chainId !== robinhood.id ? (
          <div className="banner warn">
            This wallet is on chain {chainId}. Under The Counter listings and pools in this build live on Robinhood Chain (4663).
          </div>
        ) : null}
        {isConnected && address ? (
          <div className="spread" style={{ marginBottom: 16 }}>
            <span className="muted">
              {balance.data ? `${Number(formatEther(balance.data.value)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH` : "Reading ETH balance…"}
              {connector ? ` · ${connector.name}` : ""}
            </span>
            {link ? <a href={link} target="_blank" rel="noreferrer">View account</a> : <span className="muted">No public explorer for this local fork</span>}
          </div>
        ) : null}
        {children}
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <strong>Under The Counter</strong>
          <p className="disclosure">
            Under The Counter is an independent project. It is not affiliated with, endorsed by, or operated by Robinhood Markets, Inc.
            Robinhood Chain is used only as the settlement network. The mark, interface, and contracts are original to this project.
          </p>
          <div className="actions">
            <Link href="/docs">Risks and documentation</Link>
            <Link href="/otc/create">Create a listing</Link>
            <Link href="/staking/create">Create a pool</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
