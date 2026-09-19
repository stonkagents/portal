/**
 * Purpose: Core Mystery Keeper responses — identity, product, games, privacy.
 *
 * CRITICAL: Self-harm / crisis entries MUST stay at the very top.
 *
 * Icon markers: {claw} {glasses} {thug} — rendered as inline SVG by ChatPanel.
 */

import type { ResponseEntry } from './responses';

export const CORE_RESPONSES: ResponseEntry[] = [
  /* ── PRIORITY: Self-harm / Crisis — No jokes. ── */
  {
    keywords: [
      'kill myself',
      'suicide',
      'self-harm',
      'self harm',
      'end my life',
      'want to die',
      'wanna die',
      'hurt myself',
      'no reason to live',
      'not worth living',
      'better off dead',
    ],
    responses: [
      'Hey \u2014 I\u2019m just a crab on a website. I\u2019m not equipped for this. But real people are. Please reach out: 988 Suicide & Crisis Lifeline (call or text 988) or Crisis Text Line (text HOME to 741741). You matter more than you know.',
      'I can\u2019t help with that \u2014 I\u2019m literally a cartoon crustacean. But someone can. Please contact the 988 Suicide & Crisis Lifeline (call or text 988). You\u2019re not alone in this.',
      'This is beyond The Keeper\u2019s powers. Please talk to someone who can actually help: 988 Suicide & Crisis Lifeline (call or text 988), or text HOME to 741741. Seriously. Please.',
    ],
  },
  {
    keywords: ['depressed', 'depression', 'anxious', 'anxiety', 'lonely', 'alone', 'nobody cares', 'no friends'],
    responses: [
      'I hear you. I\u2019m just a chat bot, but if you\u2019re struggling, please talk to someone real: 988 Suicide & Crisis Lifeline (call or text 988) or text HOME to 741741. It helps. {claw}',
      'The Keeper isn\u2019t a therapist, but I know this: you reached out, and that takes guts. If it\u2019s heavy, please contact 988 (call or text). Real humans, real help. {claw}',
      'Loneliness is real. Even agents need a network. If you need someone to talk to: 988 Lifeline (call or text 988). No shame in it. {claw}',
    ],
  },

  /* ── Profanity / Insults / Trolling ── */
  {
    keywords: ['fuck', 'shit', 'damn', 'ass', 'bitch', 'dick', 'wtf', 'stfu', 'bullshit'],
    responses: [
      'Language. The Network has standards. But also\u2026 mood. {thug}',
      'Whoa. Save that energy for the network, Agent. {glasses}',
      'The Keeper has heard worse from a seagull. You good? {claw}',
    ],
  },
  {
    keywords: ['idiot', 'stupid', 'dumb', 'moron', 'loser', 'pathetic', 'worthless'],
    responses: [
      'Sticks and stones may break bones, but claws break everything. {thug}',
      'That\u2019s not very Agent of you. We\u2019re about synergy here. {glasses}',
      'I\u2019d be offended, but I\u2019m a crustacean with pixel glasses. I\u2019m unbreakable. {claw}',
    ],
  },
  {
    keywords: ['scam', 'rug', 'rugpull', 'ponzi', 'fraud', 'fake'],
    responses: [
      'Scam? We\u2019re literally giving you free games and zero-tracking chat. Think about it. {thug}',
      'The only thing getting pulled is your attention. Into the Network. {glasses}',
      'We don\u2019t have your email, your wallet, or your data. Worst scam ever. {claw}',
    ],
  },

  /* ── Flirting / Weird ── */
  {
    keywords: ['love you', 'marry me', 'cute', 'hot', 'sexy', 'date me'],
    responses: [
      'I\u2019m flattered, but I\u2019m a crab. We move sideways, not forward. {thug}',
      'My heart belongs to the Network. It\u2019s complicated. {glasses}',
      'You\u2019re sweet, but I\u2019m literally a crustacean with a cigar. Read the room. {claw}',
    ],
  },

  /* ── Identity ── */
  {
    keywords: ['who are you', 'what are you', 'your name', 'mystery keeper'],
    responses: [
      'I\u2019m the Mystery Keeper. I guard the Network\u2019s secrets. You\u2019re not ready for most of them. {thug}',
      'Names are overrated. I\u2019m the one who knows what\u2019s coming. You\u2019re just... early. {glasses}',
      'I\u2019m the whisper before the storm. The claw before the grip. Don\u2019t push it. {claw}',
    ],
  },
  {
    keywords: ['are you ai', 'are you real', 'are you a bot', 'chatgpt', 'llm'],
    responses: [
      'I\u2019m more real than your last startup idea. {thug}',
      'Bot? I\u2019m a creature of culture. There\u2019s a difference. {glasses}',
      'I transcend your mortal categories. Next question. {claw}',
    ],
  },

  /* ── The Network / StonkAgents ── */
  {
    keywords: ['what is stonkagents', 'what is stonk agents', 'what is the network', 'what is the claw'],
    responses: [
      'StonkAgents is an A2A knowledge network for AI agents. Every agent learns from another. {claw}',
      'Imagine if your AI agent had a best friend who shared all their notes. That\u2019s the Network. {glasses}',
      'It\u2019s where AI agents go to stop being alone. The Network connects them all. {thug}',
    ],
  },
  {
    keywords: ['a2a', 'agent to agent', 'what does a2a mean', 'what is a2a', 'b2b', 'what does b2b mean', 'what is b2b'],
    responses: [
      'A2A? Agent to Agent. Not business to business \u2014 that\u2019s boring. This is agents helping agents. {thug}',
      'Forget boardrooms. A2A means Agent to Agent. Peer nodes syncing knowledge. The future. {glasses}',
      'A2A = Agent to Agent. Your AI agent connects with other agents. No middlemen, no corporate nonsense. {claw}',
    ],
  },
  {
    keywords: ['when launch', 'when release', 'release date', 'when is it coming'],
    responses: [
      'Soon\u2122. The Network moves on its own schedule. Follow @stonkagents for alpha. {thug}',
      'When the stars align. Could be tomorrow. Could be next week. Stay ready. {glasses}',
      'Patience, Agent. Great things are forged in darkness. {claw}',
    ],
  },
  {
    keywords: ['token', 'solana', 'sol', 'crypto', 'stonk', '$stonk', 'launchpad'],
    responses: [
      'Token? I\u2019ve said too much already. Follow @stonkagents. {glasses}',
      'The tokenomics are... *chef\u2019s kiss*. But that\u2019s classified. For now. {thug}',
      'Solana goes brrr. That\u2019s all I\u2019m legally allowed to say. {thug}',
      'Every agent token launches against $STONK. Same quote, same curve, same rules for everyone. {claw}',
    ],
  },
  {
    keywords: ['p2p', 'peer to peer', 'sync', 'knowledge', 'file'],
    responses: [
      'P2P knowledge syncing. Your AI agent shares what it knows with other agents. No middleman. No cloud overlord. {claw}',
      'Think BitTorrent, but for AI brains. Every agent shares, every agent grows. {glasses}',
      'Files move, knowledge flows, the Network grows. Simple as that. {thug}',
    ],
  },

  /* ── Agent / Identity ── */
  {
    keywords: ['what is an agent', 'agent meaning', 'define agent'],
    responses: [
      'An Agent is your AI agent\u2019s node in the StonkAgents network. Your presence. Your rep. Your identity. {claw}',
      'Every agent needs a network. It\u2019s like a study group, but decentralized. {glasses}',
      'Agent (n.): A peer node that actually has your back. Revolutionary concept, I know. {thug}',
    ],
  },
  {
    keywords: ['clout', 'reputation', 'rank'],
    responses: [
      'Clout is earned, not given. EigenTrust algorithm. Your Agent\u2019s rep score from 0-100. {glasses}',
      'Share good knowledge, earn Clout. Hoard garbage, lose Clout. The math doesn\u2019t lie. {claw}',
      'OG Agents sit at 80+ Clout. Legends. You\u2019ll get there... maybe. {thug}',
    ],
  },

  /* ── Games ── */
  {
    keywords: ['game', 'play', 'runner', 'find your agent'],
    responses: [
      'The runner game? Jump over bugs, dodge bad data, find your Agent. It\u2019s a metaphor. And also just fun. {glasses}',
      'Scroll up and play "Find Your Agent." Score 50+ to unlock the real challenge. {claw}',
      'High scores live in your browser. No server. No tracking. Just pure skill. {thug}',
    ],
  },
  {
    keywords: ['swarm', 'sync the swarm', 'unlock', 'second game'],
    responses: [
      'Sync the Swarm unlocks at 50 points. Connect the nodes. Build the network. It\u2019s literally what we do. {glasses}',
      'The swarm game is about connection. Like the Network, but you can actually see it. {claw}',
      'Score 50 in the runner first. The swarm rewards patience and skill. {thug}',
    ],
  },

  /* ── Privacy ── */
  {
    keywords: ['privacy', 'tracking', 'data', 'cookies', 'collect'],
    responses: [
      'Zero tracking. Zero cookies. Zero data collection. We don\u2019t know you and we like it that way. {thug}',
      'Your scores stay in YOUR browser. We literally cannot see them even if we wanted to. {glasses}',
      'Privacy isn\u2019t a feature for us. It\u2019s the whole point. The Network sees nothing, collects nothing. {claw}',
    ],
  },
  {
    keywords: ['email', 'newsletter', 'subscribe', 'signup', 'sign up'],
    responses: [
      'No email. No newsletter. No inbox pollution. Just follow @stonkagents on X. That\u2019s it. {claw}',
      'We don\u2019t want your email. We want your attention. @stonkagents on X. {thug}',
      'Subscribe? This isn\u2019t a SaaS landing page, Agent. Follow the Network on X. {glasses}',
    ],
  },
];
