/**
 * Purpose: Register all WebMCP tools with navigator.modelContext when available.
 *          Wraps each tool's execute with a sliding-window rate limiter (30 req/min).
 */

import type { WebMCPToolDefinition } from './types';
import { TOOL_RATE_LIMIT_PER_MIN } from './constants';
import { searchKnowledgeTool } from './tools/search-knowledge';
import { browseAgentsTool } from './tools/browse-agents';
import { networkStatsTool } from './tools/network-stats';
import { agentReputationTool } from './tools/agent-reputation';
import { agentBoardTool } from './tools/agent-board';
import { getInstallerTool } from './tools/get-installer';

const ALL_TOOLS = [searchKnowledgeTool, browseAgentsTool, networkStatsTool, agentReputationTool, agentBoardTool, getInstallerTool];

/** Sliding-window rate limiter — shared across all tools */
const callTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  while (callTimestamps.length > 0 && callTimestamps[0] < windowStart) {
    callTimestamps.shift();
  }
  return callTimestamps.length >= TOOL_RATE_LIMIT_PER_MIN;
}

function withRateLimit(tool: WebMCPToolDefinition): WebMCPToolDefinition {
  return {
    ...tool,
    execute: async params => {
      if (isRateLimited()) {
        return { error: 'Rate limit exceeded. Please wait before making more requests.', access: undefined };
      }
      callTimestamps.push(Date.now());
      return tool.execute(params);
    },
  };
}

export function registerWebMCPTools(): void {
  if (!navigator.modelContext) return;

  for (const tool of ALL_TOOLS) {
    navigator.modelContext.registerTool(withRateLimit(tool));
  }
}
