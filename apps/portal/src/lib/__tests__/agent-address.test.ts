/**
 * The address the portal tells the user to look for follows the environment:
 * dev runs the agent on 127.0.0.1:7861, staging on 7851, production on 7841.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://127.0.0.1:7861/api/v1' },
}));

import { agentAddress } from '../agent-address';

describe('agentAddress', () => {
  it('reads host:port from the configured daemon URL', () => {
    expect(agentAddress()).toBe('127.0.0.1:7861');
  });

  it('drops the /api/v1 path and keeps the port of an explicit URL', () => {
    expect(agentAddress('http://localhost:7841/api/v1')).toBe('localhost:7841');
    expect(agentAddress('http://127.0.0.1:7851')).toBe('127.0.0.1:7851');
    expect(agentAddress('http://[::1]:7841/')).toBe('[::1]:7841');
  });

  it('fills in the scheme default when the URL names no port', () => {
    expect(agentAddress('https://agent.example.test/api/v1')).toBe('agent.example.test:443');
    expect(agentAddress('http://agent.example.test')).toBe('agent.example.test:80');
  });

  it('shows a bare host:port when the value is not a URL', () => {
    expect(agentAddress('127.0.0.1:7861/api/v1')).toBe('127.0.0.1:7861');
  });
});
