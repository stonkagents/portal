/**
 * Purpose: Transaction log (with CSV export built in the page), earning sources, and spending log from the ledger
 */
'use client';

import { cn } from '@/lib/utils/cn';
import { Button, EmptyState } from '@/components/ui';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { SectionTitle, SettingsCard, downloadBlob } from './shared';
import type { TransactionResponse } from '@/lib/api/daemon-credits';

export const TRANSACTIONS_CSV_FILENAME = 'stonkagents-transactions.csv';

/** RFC 4180 quoting: wrap when the value carries a comma, quote or newline; double the quotes. */
function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The transaction log as CSV, one row per transaction, ISO dates, amounts signed as the ledger has them. */
export function transactionsCsv(transactions: readonly TransactionResponse[]): string {
  const header = ['id', 'created_at', 'reason', 'balance_type', 'amount'];
  const rows = transactions.map(tx => [tx.id, tx.created_at, tx.reason, tx.balance_type, tx.amount].map(csvCell).join(','));
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}

interface CreditTransactionsProps {
  transactions: TransactionResponse[] | undefined;
  isLoading: boolean;
  /** The ledger lives on the agent; offline, the lists show the notice instead of "nothing yet". */
  agentConnected?: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

export function CreditTransactions({ transactions, isLoading, agentConnected = true }: CreditTransactionsProps) {
  const earned = agentConnected ? (transactions?.filter(tx => tx.amount > 0) ?? []) : [];
  const spent = agentConnected ? (transactions?.filter(tx => tx.amount < 0) ?? []) : [];
  const rows = agentConnected ? transactions : undefined;
  const loading = agentConnected && isLoading;
  const canExport = agentConnected && !!rows && rows.length > 0;

  function exportCsv() {
    if (!rows || rows.length === 0) return;
    downloadBlob(TRANSACTIONS_CSV_FILENAME, transactionsCsv(rows), 'text/csv;charset=utf-8');
  }

  return (
    <>
      {/* Transaction Log */}
      <SettingsCard>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Transaction Log</SectionTitle>
          <Button
            variant="ghost"
            size="sm"
            icon="download"
            onClick={exportCsv}
            disabled={!canExport}
            title={agentConnected ? undefined : 'Start your agent to export the log'}
            data-testid="tx-export"
          >
            CSV
          </Button>
        </div>
        <div className="max-h-[240px] overflow-y-auto" data-testid="transaction-log">
          <div className="grid grid-cols-[80px_1fr_80px] gap-2 py-2 font-semibold text-xs text-text-secondary border-b-2 border-border-default">
            <span>Date</span>
            <span>Description</span>
            <span className="text-right">Amount</span>
          </div>
          {!agentConnected && <AgentRequiredNotice variant="panel" className="mt-3" data-testid="transaction-log-agent-required" />}
          {loading && <div className="py-4 text-center text-xs text-text-tertiary">Loading transactions...</div>}
          {agentConnected && !loading && (!rows || rows.length === 0) && <EmptyState size="sm" title="No transactions yet." />}
          {rows?.map(tx => (
            <div
              key={tx.id}
              className="grid grid-cols-[80px_1fr_80px] gap-2 py-2 border-b border-border-default last:border-b-0 text-xs items-center"
            >
              <span className="text-text-tertiary font-mono">{formatDate(tx.created_at)}</span>
              <span className="text-text-primary truncate" title={tx.reason}>
                {tx.reason}
              </span>
              <span className={cn('text-right font-mono font-semibold', tx.amount > 0 ? 'text-accent-green' : 'text-accent-red')}>
                {tx.amount > 0 ? '+' : ''}
                {tx.amount}
              </span>
            </div>
          ))}
        </div>
      </SettingsCard>

      {/* Earning Sources */}
      <SettingsCard>
        <SectionTitle>Earning Sources</SectionTitle>
        <div className="max-h-[200px] overflow-y-auto">
          {!agentConnected && <AgentRequiredNotice className="py-2" data-testid="earning-sources-agent-required" />}
          {loading && <div className="py-2 text-xs text-text-tertiary">Loading...</div>}
          {agentConnected && !loading && earned.length === 0 && <EmptyState size="sm" title="No earnings yet." />}
          {earned.map(tx => (
            <div key={tx.id} className="flex justify-between items-center py-2 border-b border-border-default last:border-b-0 text-xs">
              <span className="text-text-primary">{tx.reason}</span>
              <span className="font-mono font-semibold text-accent-green">+{tx.amount}</span>
              <span className="text-text-tertiary whitespace-nowrap ml-2">{formatDate(tx.created_at)}</span>
            </div>
          ))}
        </div>
      </SettingsCard>

      {/* Spending Log */}
      <SettingsCard>
        <SectionTitle>Spending Log</SectionTitle>
        <div className="max-h-[200px] overflow-y-auto">
          {!agentConnected && <AgentRequiredNotice className="py-2" data-testid="spending-log-agent-required" />}
          {loading && <div className="py-2 text-xs text-text-tertiary">Loading...</div>}
          {agentConnected && !loading && spent.length === 0 && <EmptyState size="sm" title="No spending yet." />}
          {spent.map(tx => (
            <div key={tx.id} className="flex justify-between items-center py-2 border-b border-border-default last:border-b-0 text-xs">
              <span className="text-text-primary">{tx.reason}</span>
              <span className="font-mono font-semibold text-accent-red">{tx.amount}</span>
              <span className="text-text-tertiary whitespace-nowrap ml-2">{formatDate(tx.created_at)}</span>
            </div>
          ))}
        </div>
      </SettingsCard>
    </>
  );
}
