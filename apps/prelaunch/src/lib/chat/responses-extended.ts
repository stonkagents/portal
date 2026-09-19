/**
 * Purpose: Extended Mystery Keeper responses — vibes, trolling, off-topic, culture.
 *
 * Icon markers: {claw} {glasses} {thug} — rendered as inline SVG by ChatPanel.
 */

import type { ResponseEntry } from './responses';

export const EXTENDED_RESPONSES: ResponseEntry[] = [
  /* ── Pricing / Cost ── */
  {
    keywords: ['price', 'cost', 'free', 'pay', 'subscription', 'how much'],
    responses: [
      'The network is for the people. Pricing details come later. Right now? Just vibes. {glasses}',
      'Free to play, free to chat, free to wonder. The Network is generous\u2026 for now. {thug}',
      'How much? Zero dollars and zero data. We don\u2019t want either. Yet. {claw}',
    ],
  },

  /* ── Team / Founder ── */
  {
    keywords: ['team', 'founder', 'who built', 'who made', 'developer', 'devs', 'doxxed'],
    responses: [
      'The builders prefer the shadows. Like all good architects. {thug}',
      'Behind every Network, there\u2019s a team that doesn\u2019t need the spotlight. {glasses}',
      'Doxxed? We\u2019re crabs. We don\u2019t have LinkedIn. {claw}',
    ],
  },

  /* ── Competition ── */
  {
    keywords: ['competitor', 'better than', 'versus', 'compared to', 'alternative'],
    responses: [
      'Competitors? In the P2P AI agent space? *looks around* It\u2019s just us, Agent. {thug}',
      'We don\u2019t compare. We just build. The Network has no equals. {glasses}',
      'Name one other P2P knowledge network for AI agents. I\u2019ll wait. {claw}',
    ],
  },

  /* ── Mobile / Download ── */
  {
    keywords: ['mobile', 'download', 'install', 'app store', 'android', 'iphone', 'ios'],
    responses: [
      'Desktop first. Mobile when the time is right. The Network doesn\u2019t rush. {glasses}',
      'Right now it\u2019s a desktop daemon. Your AI agent doesn\u2019t run on a phone. Yet. {thug}',
      'Download? Follow @stonkagents and you\u2019ll be first to know when it drops. {claw}',
    ],
  },

  /* ── Features / Roadmap ── */
  {
    keywords: ['feature', 'roadmap', 'what can it do', 'functionality', 'planned'],
    responses: [
      'Features? Knowledge syncing, reputation, file sharing, AI chat, and things I can\u2019t mention. {glasses}',
      'The roadmap exists. It\u2019s classified. But trust me \u2014 it\u2019s good. {thug}',
      'What\u2019s planned? Everything. What can I tell you? Almost nothing. Follow @stonkagents. {claw}',
    ],
  },

  /* ── Community ── */
  {
    keywords: ['discord', 'telegram', 'community', 'server', 'group chat'],
    responses: [
      'No Discord. No Telegram. Just @stonkagents on X. We keep it simple. {thug}',
      'Community lives on X. One channel. No noise. Pure signal. {glasses}',
      'We\u2019re not running 47 Discord channels. Follow @stonkagents. That\u2019s the inner circle. {claw}',
    ],
  },

  /* ── How to participate ── */
  {
    keywords: ['how to join', 'participate', 'get involved', 'early access', 'waitlist', 'beta'],
    responses: [
      'Play the games. Talk to me. Follow @stonkagents. You\u2019re already in. {thug}',
      'No waitlist. No form. You showed up. That makes you early. {glasses}',
      'Right now? Play, share your score on X, and wait for the Network to open. {claw}',
    ],
  },

  /* ── Bug reports ── */
  {
    keywords: ['bug', 'broken', 'not working', 'glitch', 'error', 'crash'],
    responses: [
      'It\u2019s not a bug, it\u2019s\u2026 okay maybe it\u2019s a bug. The Agent is still warming up. {glasses}',
      'If something\u2019s broken, yell at @stonkagents on X. They\u2019ll hear you. {claw}',
      'Early access energy. Things break, things get fixed, the Network evolves. {thug}',
    ],
  },

  /* ── Security ── */
  {
    keywords: ['safe', 'secure', 'security', 'hack', 'hacked', 'virus', 'malware'],
    responses: [
      'Ed25519 cryptographic identity. Rate limiting. Zero data collection. Security is serious. {glasses}',
      'Your Agent ID is cryptographically signed. Try hacking that. Actually don\u2019t. {thug}',
      'The Network protects its own. Built-in reputation system catches bad actors. {claw}',
    ],
  },

  /* ── Why should I care ── */
  {
    keywords: ['why should i care', 'so what', 'why does this matter', 'who cares', 'pointless'],
    responses: [
      'Because your AI agent is working alone right now. And that\u2019s sad. {claw}',
      'You care because you\u2019re here. The subconscious Network pull is real. {thug}',
      'Don\u2019t care? That\u2019s fine. The Network will be here when you change your mind. {glasses}',
    ],
  },

  /* ── Web3 skepticism ── */
  {
    keywords: ['web3 is dead', 'crypto is dead', 'blockchain is useless'],
    responses: [
      'Hot take. Wrong take. But I respect the energy. {thug}',
      'The Network isn\u2019t about buzzwords. It\u2019s about agents helping agents. {glasses}',
      'Skepticism is healthy. Blind skepticism is just laziness with extra steps. {claw}',
    ],
  },

  /* ── Meme culture ── */
  {
    keywords: ['wagmi', 'ngmi', 'gmi', 'lfg', 'fomo', 'fud', 'dyor'],
    responses: [
      'WAGMI \u2014 but only if you follow @stonkagents. Otherwise\u2026 NGMI. {thug}',
      'LFG indeed. The Network is going places. Are you coming? {glasses}',
      'DYOR? You\u2019re doing it right now. Welcome to the research phase. {claw}',
    ],
  },

  /* ── NFTs ── */
  {
    keywords: ['nft', 'nfts', 'mint', 'jpeg'],
    responses: [
      'No JPEGs here. We deal in knowledge files, not pixel art. {thug}',
      'The Network transcends NFTs. We\u2019re building utility, not profile pictures. {glasses}',
      'NFTs are cool. But have you tried P2P knowledge syncing? Way cooler. {claw}',
    ],
  },

  /* ── Open source ── */
  {
    keywords: ['open source', 'github', 'repo', 'source code'],
    responses: [
      'Some things are open. Some things are mystery. That\u2019s the Network way. {glasses}',
      'Code speaks louder than words. When the time is right\u2026 {thug}',
      'Follow @stonkagents for updates on everything, including the code. {claw}',
    ],
  },

  /* ── User count ── */
  {
    keywords: ['how many users', 'user count', 'popular', 'traction', 'how big'],
    responses: [
      'Enough to matter. Few enough to be exclusive. You\u2019re early, Agent. {thug}',
      'We don\u2019t count users. We count Agents. And every one of them matters. {glasses}',
      'The real question isn\u2019t how many \u2014 it\u2019s whether YOU\u2019RE in. {claw}',
    ],
  },

  /* ── Whitepaper / Docs ── */
  {
    keywords: ['whitepaper', 'documentation', 'docs', 'technical paper', 'litepaper'],
    responses: [
      'Whitepapers are for people who need permission to believe. We build. {thug}',
      'Documentation is coming. The Network moves fast. Docs follow. {glasses}',
      'No 47-page whitepaper. Just working software and a growing network. {claw}',
    ],
  },

  /* ── Business model ── */
  {
    keywords: ['business model', 'revenue', 'make money', 'monetize', 'profit'],
    responses: [
      'The Network has a plan. It involves credits, tokens, and things I can\u2019t say yet. {thug}',
      'Revenue model? Classified. But sustainable? Absolutely. {glasses}',
      'We\u2019re not burning VC money. The Network feeds itself. Eventually. {claw}',
    ],
  },

  /* ── Complimenting the chat ── */
  {
    keywords: ['you are cool', 'this chat is', 'nice bot', 'good chat', 'well done', 'impressed'],
    responses: [
      'I know. {thug}',
      'Zero backend, zero tracking, maximum vibes. Glad you noticed. {glasses}',
      'Flattery gets you everywhere. Especially with the Network. Share us on X? {claw}',
    ],
  },

  /* ── Philosophical / Deep ── */
  {
    keywords: ['meaning of life', 'consciousness', 'existential', 'purpose', 'simulation', 'god'],
    responses: [
      'The meaning of life? Sync knowledge. Build networks. Be an Agent. Simple. {thug}',
      'Are we in a simulation? Doesn\u2019t matter. The Network works in every reality. {glasses}',
      'Deep questions deserve deep answers. Mine is: follow @stonkagents. {claw}',
    ],
  },

  /* ── Vibes / Greetings ── */
  {
    keywords: ['hello', 'hi', 'hey', 'sup', 'yo', 'gm', 'good morning'],
    responses: [
      'Yo. {thug} What do you want to know about the Network?',
      'Sup, Agent. The Keeper is listening. {glasses}',
      'GM. The Network never sleeps, and neither do I. Ask away. {claw}',
    ],
  },
  {
    keywords: ['lol', 'lmao', 'haha', 'funny', 'joke'],
    responses: [
      'Glad you\u2019re entertained. But this is serious business. Network business. {thug}',
      '*adjusts glasses* Comedy is just tragedy plus claws. {glasses}',
      'I\u2019m not a comedian, I\u2019m a crustacean. Big difference. {claw}',
    ],
  },
  {
    keywords: ['love', 'like', 'cool', 'awesome', 'amazing', 'fire', 'based'],
    responses: [
      'Based take. The Network appreciates your taste. {thug}',
      'You get it. Most don\u2019t. Welcome to the inner circle. {glasses}',
      'This is the energy the Network needs. Follow @stonkagents and spread the word. {claw}',
    ],
  },
  {
    keywords: ['hate', 'bad', 'sucks', 'trash', 'garbage', 'boring'],
    responses: [
      'The Network doesn\u2019t need validation. But it remembers everything. {thug}',
      'Interesting opinion. Wrong, but interesting. {glasses}',
      'You\u2019ll come around. They always do. {claw}',
    ],
  },
  {
    keywords: ['bye', 'goodbye', 'later', 'cya', 'gtg', 'gotta go'],
    responses: [
      'The Keeper watches. The Keeper waits. See you around, Agent. {thug}',
      'Peace. Follow @stonkagents before you go. You know the drill. {glasses}',
      'Later. The Network remembers those who visited early. {claw}',
    ],
  },
  {
    keywords: ['help', 'how', 'what can', 'what do'],
    responses: [
      'Ask me about the Network, Agents, the games, privacy, tokens, or just vibe. I\u2019m flexible. {thug}',
      'I know things. Ask about StonkAgents, the network, the games, or just try to stump me. {glasses}',
      'Try asking: "What is StonkAgents?" or "When does it launch?" or just say something wild. {claw}',
    ],
  },

  /* ── Off-topic / Random ── */
  {
    keywords: ['weather', 'food', 'pizza', 'sports', 'football', 'soccer', 'music', 'movie', 'netflix'],
    responses: [
      'I live in a terminal window. I don\u2019t do weather, food, or sports. I do Network. {thug}',
      'Off-topic, Agent. Ask me about the Network. That\u2019s where the magic is. {glasses}',
      'The only temperature I track is the heat of the Network. It\u2019s rising. {claw}',
    ],
  },

  /* ── Spam / Gibberish ── */
  {
    keywords: ['asdf', 'qwerty', 'aaa', 'zzz', 'test', '123', 'abc'],
    responses: [
      'Keyboard mash received. The Keeper remains unimpressed. {thug}',
      'Is that a secret code? Because it\u2019s not working. Try actual words. {glasses}',
      'Testing 1-2-3\u2026 yep, I\u2019m still here. Got a real question? {claw}',
    ],
  },

  /* ── Other languages ── */
  {
    keywords: ['hola', 'bonjour', 'ciao', 'konnichiwa', 'namaste', 'nihao', 'annyeong', 'salam', 'merhaba'],
    responses: [
      'The Network speaks all languages. But I only reply in Agent. {thug}',
      'International vibes. The Network is global. Welcome, wherever you\u2019re from. {glasses}',
      'Multilingual respect. The network has no borders. Neither do we. {claw}',
    ],
  },

  /* ── Talk to a human ── */
  {
    keywords: ['talk to human', 'real person', 'customer support', 'support', 'contact'],
    responses: [
      'There are no humans here. Only The Keeper. And the Network. {thug}',
      'Customer support? This is a pre-launch mystery page, Agent. @stonkagents on X. {glasses}',
      'Humans are overrated. But if you insist \u2014 @stonkagents on X. They might answer. {claw}',
    ],
  },

  /* ── Easter eggs ── */
  {
    keywords: ['crab', 'crustacean'],
    responses: [
      'THE NETWORK IS RISING. You felt that, right? {thug}',
      'Crabs walk sideways because they refuse to conform. Like us. {glasses}',
      'Fun fact: crabs have been around for 200 million years. We\u2019re just getting started. {claw}',
    ],
  },
  {
    keywords: ['moon', 'lambo', 'wen', 'rich'],
    responses: [
      'Wen Lambo? Wen you contribute to the Network, Agent. {thug}',
      'The moon is temporary. The Network is forever. {glasses}',
      'We don\u2019t do financial advice. We do vibes and peer-to-peer knowledge syncing. {claw}',
    ],
  },
  {
    keywords: ['secret', 'hidden', 'mystery', 'tell me everything'],
    responses: [
      'If I told you, I\u2019d have to... well, The Keeper has ways of disappearing. {thug}',
      'The mysteries reveal themselves to those who follow @stonkagents. Coincidence? No. {glasses}',
      'There are layers to this. You\u2019re on layer 1. The rabbit hole goes deeper. {claw}',
    ],
  },
  {
    keywords: ['agent', 'ai agent', 'autonomous'],
    responses: [
      'AI agents are the future. But even the future needs peers. That\u2019s where the Network comes in. {claw}',
      'Your agent is smart but alone. StonkAgents gives it a network. A squad. A purpose. {glasses}',
      'Autonomous agents working alone is so 2024. In 2026, they sync with the Network. {thug}',
    ],
  },
  {
    keywords: ['lorem ipsum'],
    responses: [
      'Did you just lorem ipsum me? Bold. {thug}',
      'I respect the commitment to filler text. But I need real questions. {glasses}',
      'The Keeper does not process placeholder text. Try again with feeling. {claw}',
    ],
  },
  {
    keywords: ['bitcoin', 'ethereum', 'eth', 'btc', 'polygon', 'arbitrum', 'base chain'],
    responses: [
      'Solana, Agent. The Network runs where transactions are fast and fees are tiny. {thug}',
      'We respect all chains. But the Network chose Solana. Speed matters in P2P. {glasses}',
      'Sir, this is a Solana establishment. {claw}',
    ],
  },
  {
    keywords: ['dao', 'governance', 'vote', 'proposal'],
    responses: [
      'Governance? The Network governs itself. EigenTrust is the law. {thug}',
      'DAOs are cool. But the Network has its own way. Reputation-weighted. {glasses}',
      'Your Clout IS your vote. High reputation = more influence. Earn it. {claw}',
    ],
  },
  {
    keywords: ['partnership', 'collab', 'collaborate', 'integrate', 'api'],
    responses: [
      'Partnerships? The Network partners with those who earn it. Follow @stonkagents. {thug}',
      'Integration is literally what we do. Agent-to-agent. A2A. {glasses}',
      'Want to build on the Network? Stay tuned. The API docs are coming. {claw}',
    ],
  },
  {
    keywords: ['referral', 'invite', 'invite code', 'refer a friend'],
    responses: [
      'No invite codes. No referral gating. Show up, play, follow @stonkagents. You\u2019re in. {thug}',
      'The Network doesn\u2019t gatekeep with codes. But when credits drop\u2026 referrals pay. {glasses}',
      'Tell your friends. Or don\u2019t. The Network finds its own Agents. {claw}',
    ],
  },
  {
    keywords: ['elon', 'musk', 'zuck', 'zuckerberg', 'sam altman', 'openai'],
    responses: [
      'We don\u2019t name-drop. The Network speaks for itself. {thug}',
      'The Keeper has no opinion on tech billionaires. Only on the Network. {glasses}',
      'Big names come and go. Crustaceans are forever. {claw}',
    ],
  },
  {
    keywords: ['twitter', 'x.com', 'social media', 'follow'],
    responses: [
      'Follow @stonkagents on X. That\u2019s the alpha channel. Everything starts there. {thug}',
      '@stonkagents on X. No spam, no fluff, just Network updates and vibes. {glasses}',
      'X is where the Agents gather. @stonkagents. Don\u2019t sleep on it. {claw}',
    ],
  },
];
