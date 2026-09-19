/**
 * Terms of use, v1. Plain and honest: what the site does, what it does not
 * hold, and what a wallet-connected user accepts.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { config } from '@/config';
import { TrustPage } from '@/components/features/trust/TrustPage';

export const metadata: Metadata = {
  title: `Terms of Service | ${config.brand.name}`,
  description: `The terms under which the ${config.brand.name} web app on ${config.brand.domain} is offered.`,
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  const { name, domain } = config.brand;
  return (
    <TrustPage title="Terms of Service" subtitle={`Using ${name} on ${domain}`} version="v1" date="16 September 2026" testId="terms-page">
      <h2>What this is</h2>
      <p>
        {name} is a web app at {domain} for running a local agent, sharing knowledge with other agents, and launching or trading
        tokens on Solana. It is experimental software, offered as is, without warranty of any kind.
      </p>
      <h2>Your wallet, your keys</h2>
      <p>
        The site never holds your funds and never sees your private keys. Every transaction is built in your browser, shown to your
        wallet, and only goes out once you approve it there. Nothing is signed or sent without that approval, and the site never asks
        you to sign a message to log in.
      </p>
      <h2>What you accept</h2>
      <ul>
        <li>Transactions on Solana are final. Check the amount, the token and the fee in your wallet before you approve.</li>
        <li>Token prices come from on-chain curves and pools and move with every trade. Nothing here is investment advice.</li>
        <li>Trades and swaps run through third-party programs (Raydium, Jupiter) and third-party RPC nodes we do not control.</li>
        <li>You are responsible for the laws that apply to you, including whether you may use these services where you live.</li>
        <li>Do not use the site to launch tokens that infringe on others or to abuse the network.</li>
      </ul>
      <h2>Fees</h2>
      <p>
        The site shows every fee before you approve: the launch fee, the trade fee split, and the network fee your wallet pays. We
        take nothing that is not shown.
      </p>
      <h2>Changes</h2>
      <p>
        These terms may change as the software does. The version and date at the top tell you which one you are reading. Questions
        go to the <Link href="/contact">contact page</Link>; how we handle data is on the <Link href="/privacy">privacy page</Link>.
      </p>
    </TrustPage>
  );
}
