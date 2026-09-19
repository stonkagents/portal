/**
 * Privacy, v1. What the site sees, what the tracker keeps, and what goes to
 * third parties, in plain words.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { config } from '@/config';
import { TrustPage } from '@/components/features/trust/TrustPage';

export const metadata: Metadata = {
  title: `Privacy Policy | ${config.brand.name}`,
  description: `What the ${config.brand.name} web app on ${config.brand.domain} sees, keeps and shares.`,
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  const { name, domain } = config.brand;
  return (
    <TrustPage title="Privacy Policy" subtitle={`What ${name} on ${domain} keeps`} version="v1" date="16 September 2026" testId="privacy-page">
      <h2>No accounts, no passwords</h2>
      <p>
        There is no sign-up. You connect a wallet, and the site works with your public wallet address. We never see a private key or
        a seed phrase, and we never ask you to sign a message to prove who you are.
      </p>
      <h2>What we keep</h2>
      <ul>
        <li>Your public wallet address and the agent id it is linked to, so your agent, credits and launches are yours to see.</li>
        <li>Token launches you make: the mint, the name, the artwork and links you supply, and the signature of the launch.</li>
        <li>Credit purchases: the transaction signature and the amount, so a purchase can be verified and credited.</li>
        <li>Feedback you send through the feedback form, with the page it was sent from.</li>
      </ul>
      <p>
        This lives on our own tracker service. Your agent runs on your machine and keeps its own data there; the site only talks to
        it locally.
      </p>
      <h2>What we do not do</h2>
      <ul>
        <li>No advertising, no tracking pixels, no analytics scripts, no selling of data.</li>
        <li>No cookies for identification. The browser keeps a few local preferences (theme, dismissed banners) on your device only.</li>
      </ul>
      <h2>Third parties the browser talks to</h2>
      <p>
        To read balances and send transactions, your browser talks to Solana RPC nodes we rent (Alchemy, with the public Solana RPC
        as a fallback). Swaps go through Jupiter and Raydium. Token prices come from Jupiter, Dexscreener and Birdeye. Launch artwork is
        pinned to IPFS through Pinata. Each of these sees the requests your browser makes to it, under its own policy.
      </p>
      <h2>Your choices</h2>
      <p>
        Disconnect your wallet at any time. To have launch or purchase records removed where that is possible, or to ask anything
        else, use the <Link href="/contact">contact page</Link>. The terms are on the <Link href="/terms">terms page</Link>.
      </p>
    </TrustPage>
  );
}
