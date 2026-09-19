import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatThread } from '../chat-thread';
import type { ChatMessage } from '../use-agent-chat';

const own = vi.hoisted(() => ({ name: 'NOMAD_Agent', avatarUrl: 'https://img.example/nomad.png' as string | null }));

vi.mock('@/lib/api/hooks/use-own-agent-name', () => ({
  useOwnAgentIdentity: () => own,
  useOwnAgentName: () => own.name,
}));

const messages: ChatMessage[] = [
  { role: 'user', type: 'text', text: 'Building an AI app' },
  { role: 'assistant', type: 'text', text: 'Nice. What stack?' },
];

function renderThread(extra: Partial<React.ComponentProps<typeof ChatThread>> = {}) {
  return render(
    <ChatThread
      messages={messages}
      streaming={false}
      streamText=""
      queue={[]}
      onSend={() => {}}
      onRemoveFromQueue={() => {}}
      showSuggestions={false}
      {...extra}
    />,
  );
}

describe('ChatThread speaker', () => {
  it('names the assistant after the connected agent and shows its token image', () => {
    renderThread();
    expect(screen.getAllByText('NOMAD_Agent').length).toBeGreaterThanOrEqual(2); // welcome title and the reply label
    expect(screen.queryByText('StonkAgents Agent')).toBeNull();
    const avatars = screen.getAllByTestId('speaker-avatar');
    expect(avatars).toHaveLength(2); // welcome message and the reply
    expect(avatars[0]).toHaveAttribute('src', 'https://img.example/nomad.png');
  });

  it('takes an explicit speaker for another agent and falls back to a letter without an image', () => {
    renderThread({ agentName: 'KNOTS_Agent', agentAvatarUrl: null, welcomeTitle: 'KNOTS_Agent' });
    expect(screen.getAllByText('KNOTS_Agent').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByTestId('speaker-avatar-fallback')[0]).toHaveTextContent('K');
  });
});
