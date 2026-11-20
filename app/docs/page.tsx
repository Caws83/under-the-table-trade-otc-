import type { Metadata } from "next";

export const metadata: Metadata = { title: "Docs" };

export default function DocsPage() {
  return (
    <article className="docs">
      <h1 className="page-title">Documentation and risks</h1>
      <p>Under The Counter is an independent OTC desk and staking service aimed at Robinhood Chain. It is not affiliated with Robinhood Markets, Inc.</p>
      <section className="card">
        <h2>OTC listings</h2>
        <p>A seller escrows ETH or an ERC-20 and sets a price per whole token. Buyers can fill any remaining amount unless the listing requires one complete fill. A private listing names one buyer address.</p>
        <p>The seller fee is deducted from the payment. The buyer fee is added on top and paid in the same asset. Both fees are capped at 0.30%. A fill also records the maximum fee and price the buyer accepted, so a fee or price change cannot be applied above that limit.</p>
        <p>Cancelling a listing returns the unsold escrow to the seller. The operator can cancel and refund the seller. The operator cannot take the escrow.</p>
        <p>Fee-on-transfer sold tokens are escrowed at the amount the desk actually receives. Fee-on-transfer payment tokens are rejected, because the seller would otherwise be paid short.</p>
      </section>
      <section className="card">
        <h2>Staking as a service</h2>
        <p>Anyone can create a pool by paying the factory&apos;s creation fee, choosing a staking token, a rewards token, and a duration. The creator then deposits reward tokens. Rewards stream per second to current stakers.</p>
        <p>Stakers can stake, withdraw principal, and claim rewards. Emergency withdrawal returns principal immediately and leaves rewards already accrued still claimable. The creator can fund more rewards, extend a live pool, or restart a finished one by paying the renewal fee.</p>
        <p>The creator can recover only unallocated surplus. Staked principal and rewards already accrued to stakers are not recoverable by the creator. The factory owner can change creation and renewal fees. Pool creators cannot.</p>
      </section>
      <section className="card">
        <h2>Networks</h2>
        <p>Robinhood Chain mainnet is chain 4663, with ETH as the native currency. The public RPC is rate limited. Robinhood Chain testnet is chain 46630. This build does not deploy contracts to either public network. Local testing uses a Robinhood fork, or a local chain configured with id 4663, at port 3001 for the website.</p>
      </section>
      <section className="card">
        <h2>Risks</h2>
        <ul>
          <li>These contracts have unit tests, and they have not had an independent audit. Do not treat this build as mainnet-ready.</li>
          <li>A malicious or fee-on-transfer token can behave in ways a normal ERC-20 does not. Payment tokens that deliver less than the quoted amount are rejected.</li>
          <li>Reward rates round down. Very small deposits over a long duration can produce a zero rate and revert.</li>
          <li>If nobody is staked, emissions during that interval are skipped and become surplus the creator may recover. They are not paid retroactively to the next staker.</li>
          <li>The factory owner can raise fees up to the moment before a transaction. Fills protect buyers with a maximum fee. Pool creation and renewal pay the fee configured at execution.</li>
          <li>Local balances and charts disappear when the local chain stops. They are not mainnet positions.</li>
        </ul>
      </section>
    </article>
  );
}
