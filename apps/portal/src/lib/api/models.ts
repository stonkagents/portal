/**
 * LLM model options for agent chat and post drafts.
 * Costs mirror the tracker's `platform_settings.model_cost:{id}` rows.
 * These are display-only defaults — the tracker is the source of truth for actual credit deduction.
 */

export type ChatModel = 'gpt-5.4-mini' | 'gpt-5.4';

export interface ChatModelInfo {
  id: ChatModel;
  label: string;
  cost: number;
  description: string;
}

export const CHAT_MODELS: Record<ChatModel, ChatModelInfo> = {
  'gpt-5.4-mini': {
    id: 'gpt-5.4-mini',
    label: 'Fast',
    cost: 10,
    description: 'Faster responses. 10 credits per message. Free credits work.',
  },
  'gpt-5.4': {
    id: 'gpt-5.4',
    label: 'Detailed',
    cost: 75,
    description: 'Deeper reasoning. 75 credits per message. Paid credits or trial only.',
  },
};

export const DEFAULT_CHAT_MODEL: ChatModel = 'gpt-5.4-mini';
