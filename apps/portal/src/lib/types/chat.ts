/**
 * Purpose: Chat session types for AI agent chat
 */

/** API response shape for chat sessions */
export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  messageCount: number;
}
