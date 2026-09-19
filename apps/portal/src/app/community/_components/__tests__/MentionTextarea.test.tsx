/**
 * Purpose: Typing `@` plus a name prefix in a compose box asks the tracker
 *          for matching display names and lists them; picking one (click,
 *          Enter or Tab) writes `@name ` over the prefix; Escape closes the
 *          list until the prefix changes. An `@` inside a word is not a mention.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';

const search = vi.hoisted(() => vi.fn((q: string) => ({ data: q ? [{ peerId: 'peer-a', displayName: 'alice', reputationTier: 'top' }, { peerId: 'peer-b', displayName: 'albert', reputationTier: 'new' }] : [] })));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({ useDisplayNameSearch: (q: string) => search(q) }));

import { MentionTextarea, completeMention, mentionAtCaret } from '../MentionTextarea';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MentionTextarea data-testid="box" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

function type(text: string) {
  const box = screen.getByTestId('box') as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text, selectionStart: text.length } });
}

beforeEach(() => search.mockClear());

describe('mention helpers', () => {
  it('finds the @prefix at the caret and nowhere else', () => {
    expect(mentionAtCaret('hey @al', 7)).toEqual({ prefix: 'al', start: 4 });
    expect(mentionAtCaret('@al', 3)).toEqual({ prefix: 'al', start: 0 });
    expect(mentionAtCaret('mail@al', 7)).toBeNull();
    expect(mentionAtCaret('hey @al and', 11)).toBeNull();
    expect(mentionAtCaret('hey @', 5)).toBeNull();
  });

  it('completes the prefix into @name with a trailing space', () => {
    expect(completeMention('hey @al ok', 4, 2, 'alice')).toEqual({ value: 'hey @alice  ok', caret: 11 });
  });
});

describe('MentionTextarea', () => {
  it('lists matching names after the debounce and completes on click', async () => {
    render(<Harness />);
    type('cc @al');
    await waitFor(() => expect(screen.getByTestId('box-mentions')).toBeInTheDocument());
    expect(search).toHaveBeenLastCalledWith('al');
    expect(screen.getByTestId('mention-option-peer-a')).toHaveTextContent('@alice');
    expect(screen.getByTestId('mention-option-peer-a')).toHaveTextContent('Top');
    fireEvent.click(screen.getByTestId('mention-option-peer-a'));
    expect(screen.getByTestId('value')).toHaveTextContent('cc @alice');
    expect(screen.queryByTestId('box-mentions')).toBeNull();
  });

  it('moves with the arrows, picks with Enter and closes with Escape', async () => {
    render(<Harness />);
    type('@al');
    await waitFor(() => expect(screen.getByTestId('box-mentions')).toBeInTheDocument());
    const box = screen.getByTestId('box');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTestId('value')).toHaveTextContent('@albert');

    await act(async () => type('@albert @al'));
    await waitFor(() => expect(screen.getByTestId('box-mentions')).toBeInTheDocument());
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByTestId('box-mentions')).toBeNull();
  });

  it('asks nothing without an @prefix', async () => {
    render(<Harness />);
    type('plain text');
    await new Promise(r => setTimeout(r, 300));
    expect(screen.queryByTestId('box-mentions')).toBeNull();
    expect(search).toHaveBeenLastCalledWith('');
  });
});
