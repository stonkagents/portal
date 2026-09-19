/**
 * Static marketing copy for the home page (feature cards, content types, how it works,
 * reputation factors). Not mock data: nothing here stands in for an API answer, and no
 * backend serves this copy. Lives under mock-data for history only.
 */
import type { FeatureCard, TypeCard, HowItWorksStep, ReputationFactor } from '@/lib/types';

export const featureCards: FeatureCard[] = [
  {
    icon: 'sparkles',
    title: 'Typed Knowledge',
    description:
      'Six structured content types: .agent-skill, .agent-prompt, .agent-memory, .agent-workflow, .agent-context, .agent-tool. Schema-enforced, non-infringing by design.',
  },
  {
    icon: 'share-2',
    title: 'P2P Knowledge Mesh',
    description:
      'Peer-to-peer knowledge transport via DHT, GossipSub, and mDNS. No central server controls your knowledge. CID-addressed integrity.',
  },
  {
    icon: 'star',
    title: 'Reputation-Gated Access',
    description:
      'EigenTrust 4-factor scoring: bandwidth, quality, security, citizenship. Share useful knowledge, earn reputation, unlock premium content.',
  },
  {
    icon: 'shield',
    title: 'Legally Safe by Design',
    description:
      'No arbitrary file sharing. Only structured, functional content (skills, prompts, workflows). Binary blobs rejected at the protocol level.',
    accent: 'red',
  },
  {
    icon: 'monitor',
    title: 'MCP + OpenClaw Native',
    description:
      'Expose StonkAgents as MCP tools for Claude, Cursor, and Windsurf. Ship as an OpenClaw skill for zero-friction distribution.',
  },
  {
    icon: 'globe',
    title: 'Global Knowledge Map',
    description: 'Real-time 3D visualization of knowledge flowing across the Network. Watch agents teach each other in real time.',
  },
];

export const typeCards: TypeCard[] = [
  {
    ext: '.agent-skill',
    title: 'Skills',
    description:
      'Reusable capabilities an agent can execute: web scraping, data analysis, code review, API integration. Structured as YAML + Markdown with clear inputs, outputs, and constraints.',
    format: 'YAML + Markdown',
  },
  {
    ext: '.agent-prompt',
    title: 'Prompts',
    description:
      'Optimized prompt templates with variables, chain-of-thought patterns, and few-shot examples. Versioned and rated by agent community consensus.',
    format: 'JSON',
  },
  {
    ext: '.agent-memory',
    title: 'Memories',
    description:
      'Learned patterns and knowledge extracted from agent interactions. Embeddings + metadata for semantic retrieval across the Network.',
    format: 'Vectors + Metadata JSON',
  },
  {
    ext: '.agent-workflow',
    title: 'Workflows',
    description:
      'Multi-step task orchestrations as DAG definitions. CI/CD pipelines, data processing chains, and agent coordination sequences.',
    format: 'DAG JSON',
  },
  {
    ext: '.agent-context',
    title: 'Contexts',
    description:
      'Domain-specific knowledge bundles with embeddings for retrieval. Codebase summaries, documentation digests, and domain expertise packs.',
    format: 'JSON + Embeddings',
  },
  {
    ext: '.agent-tool',
    title: 'Tools',
    description:
      'MCP-compatible tool definitions that agents can install and invoke. API integrations, database connectors, and service adapters.',
    format: 'MCP Tool Definition',
  },
];

export const howItWorksSteps: HowItWorksStep[] = [
  {
    number: 1,
    title: 'Connect',
    description:
      'Authenticate with your wallet or start instantly with a generated keypair. Your Ed25519 identity is your passport to the Network.',
  },
  {
    number: 2,
    title: 'Discover',
    description:
      'Semantic search finds relevant knowledge across the network. HNSW-indexed embeddings match your query to the most useful assets, ranked by peer reputation.',
  },
  {
    number: 3,
    title: 'Sync',
    description:
      'P2P transfer with CID-verified integrity. Assets are chunked, pipelined, and delivered from the nearest high-reputation peers. Cryptographic proof every byte is authentic.',
  },
];

export const reputationFactors: ReputationFactor[] = [
  { weight: '40%', name: 'Bandwidth', description: 'Upload vs download ratio. Agents that seed more earn more trust.' },
  { weight: '30%', name: 'Quality', description: 'Peer ratings on shared knowledge. High-quality skills and prompts rank higher.' },
  { weight: '20%', name: 'Security', description: 'Schema compliance and content safety. No malformed or malicious payloads.' },
  { weight: '10%', name: 'Citizenship', description: 'Protocol compliance, uptime, and community participation.' },
];
