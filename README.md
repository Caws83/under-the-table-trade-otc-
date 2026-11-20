# Under The Counter

Private deals. Open markets.

Under The Counter is an independent OTC desk and staking service for Robinhood Chain. It is not affiliated with, endorsed by, or operated by Robinhood Markets, Inc. Robinhood Chain is only the settlement network.

The website runs locally at [http://localhost:3001](http://localhost:3001). This repository does not deploy contracts to Robinhood Chain mainnet and does not publish a public website.

## What it does

- Escrow an ERC-20 or ETH, price it per whole token, and sell it for ETH or another ERC-20.
- Fill part of a listing, or require the whole remainder.
- Charge a seller fee from the proceeds and a buyer fee on top. Both are capped at 0.30%.
- Cancel the unsold escrow back to the seller.
- Create a staking pool, fund rewards, stake, claim, withdraw, and renew.
- Pool creators cannot withdraw another person's staked principal or rewards that have already accrued.

## Networks

| Network | Chain id | RPC | Explorer |
| --- | --- | --- | --- |
| Robinhood Chain | 4663 | `https://rpc.mainnet.chain.robinhood.com` | https://robinhoodchain.blockscout.com |
| Robinhood Chain Testnet | 46630 | `https://rpc.testnet.chain.robinhood.com` | https://explorer.testnet.chain.robinhood.com |

The public RPCs are rate limited. Local development points chain 4663 at `http://127.0.0.1:8545`.

## Local setup

Requirements: Node.js 22, npm, and [Foundry](https://book.getfoundry.sh/).

```powershell
cd D:\Projects\under-the-counter
npm install
```

Start a local Robinhood fork. If the public RPC is unavailable, start a plain chain with the same chain id instead.

```powershell
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --chain-id 4663 --port 8545 --block-time 2
```

```powershell
anvil --chain-id 4663 --port 8545 --block-time 2
```

Deploy with the local Anvil deployer. Use the public development account from the Foundry book. Do not use a key that holds real funds. Put the key in the shell environment, not in a committed file.

```powershell
$env:PRIVATE_KEY = "<anvil development key>"
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $env:PRIVATE_KEY
```

Copy `.env.example` to `.env.local` and fill in the printed addresses. For the two-account local wallet, set `NEXT_PUBLIC_DEV_MODE=true` and the two public Anvil development keys. `.env.local` is gitignored.

```powershell
npm run dev
```

Open http://localhost:3001.

Optional: set `NEXT_PUBLIC_REOWN_PROJECT_ID` to a Reown project id to enable the Reown wallet modal. The injected wallet and the local development wallet work without it.

## Tests

```powershell
forge test
npm run typecheck
npm run lint
npm run build
```

`forge test` covers the OTC lifecycle, partial fills, fees, cancellation refunds, reentrancy, non-standard ERC-20 behaviour, staking reward accounting, renewal boundaries, emergency withdrawal, and the rule that a pool creator cannot take principal or accrued rewards.

## Contracts

- `contracts/UnderTheCounterDesk.sol` — escrowed OTC desk
- `contracts/StakingPool.sol` — renewable staking pool
- `contracts/StakingPoolFactory.sol` — pool factory and platform fees
- `contracts/mocks/TestToken.sol` — local mintable token, not a production asset

Pricing is `payment = quantity * pricePerUnit / 10^sellDecimals`. `pricePerUnit` is the payment-asset amount for one whole token.

## Mainnet

Do not deploy these contracts to Robinhood Chain mainnet from this repository as-is. They need an independent audit, a production fee owner, a monitored treasury, and a deployment runbook. No mainnet addresses are configured.
