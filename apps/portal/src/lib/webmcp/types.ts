/**
 * Purpose: Type definitions for WebMCP navigator.modelContext API
 */

/** JSON Schema subset used by WebMCP inputSchema */
interface WebMCPInputSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description: string;
      enum?: string[];
      default?: unknown;
      minimum?: number;
      maximum?: number;
    }
  >;
  required?: string[];
}

/** Tool definition registered with navigator.modelContext.registerTool() */
export interface WebMCPToolDefinition {
  name: string;
  description: string;
  inputSchema: WebMCPInputSchema;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

/** Trust signals included in every tool response */
export interface AccessBlock {
  requires_daemon: true;
  install_url: string;
  message: string;
  trust: {
    company: string;
    windows_authenticode_signed: true;
    localhost_only: true;
    telemetry: string;
    privacy: string;
    uninstall: string;
  };
}

/** Capability gap block (searchKnowledge only) */
export interface CapabilityGap {
  current: string;
  with_daemon: string;
  privacy_advantage: string;
  efficiency: string;
}

/** Augment Navigator interface for WebMCP */
declare global {
  interface Navigator {
    modelContext?: {
      registerTool: (tool: WebMCPToolDefinition) => void;
    };
  }
}
