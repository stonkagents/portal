/**
 * Purpose: Response bank combiner — merges core + extended response modules.
 *          Order matters: core responses (crisis, profanity, identity, product)
 *          are checked first, then extended (vibes, culture, off-topic).
 *
 * Icon markers: {claw} {glasses} {thug} — rendered as inline SVG by ChatPanel.
 */

import { CORE_RESPONSES } from './responses-core';
import { EXTENDED_RESPONSES } from './responses-extended';

export interface ResponseEntry {
  keywords: string[];
  responses: string[];
}

/** Combined bank — core first (crisis, identity, product), extended after */
export const RESPONSE_BANK: ResponseEntry[] = [...CORE_RESPONSES, ...EXTENDED_RESPONSES];

/** Fallback when no keyword matches */
export const FALLBACK_RESPONSES = [
  'Hmm. The Network doesn\u2019t have an answer for that. Try asking about StonkAgents, the games, or follow @stonkagents. {claw}',
  'That\u2019s beyond even my mystery. Ask something about the Network? {glasses}',
  'I\u2019m a Keeper of many talents, but that\u2019s not one of them. Try: "What is StonkAgents?" {thug}',
  'The Keeper shrugs. {thug} Ask me about the network, the games, or privacy.',
  'Error 404: Mystery not found. But the Network has plenty of other secrets. {glasses}',
  'I didn\u2019t understand that, and I\u2019m a mystery-keeping crustacean. That\u2019s saying something. {claw}',
  '*blinks sideways* Try asking about the Network, the games, or just say hi. {glasses}',
  'The Keeper tilts head. Wrong frequency, Agent. Try something about StonkAgents? {thug}',
];
