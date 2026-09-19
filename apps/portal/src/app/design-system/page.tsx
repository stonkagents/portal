/* DELETE ME — Dev-only design system showcase. Remove before production. */
'use client';

import { useState } from 'react';
import {
  Icon,
  Button,
  Badge,
  Card,
  Input,
  Stat,
  ProgressBar,
  Table,
  Tooltip,
  TabBar,
  FilterChip,
  Modal,
  PageHeader,
  Container,
  useToast,
} from '@/components/ui';
import type { IconName } from '@/components/ui';
import { ClawMascot } from '@/components/brand';
import { UpdateBanner } from '@/components/layout/UpdateBanner';
import { allMockUpdateStates } from '@/lib/mock-data/update-status';
import { useBoardStats } from '@/lib/api/hooks/use-board-stats';
import { assetTypeLabel } from '@/lib/utils/asset-type-label';

const sampleIcons: IconName[] = [
  'activity',
  'alert-triangle',
  'award',
  'bar-chart',
  'bell',
  'bot',
  'check-circle',
  'clock',
  'copy',
  'cpu',
  'crown',
  'download',
  'eye',
  'file',
  'flame',
  'folder',
  'gauge',
  'globe',
  'hard-drive',
  'hash',
  'heart',
  'home',
  'info',
  'key',
  'layers',
  'link',
  'lock',
  'map-pin',
  'menu',
  'message-circle',
  'monitor',
  'moon',
  'network',
  'palette',
  'play',
  'power',
  'rocket',
  'search',
  'send',
  'server',
  'settings',
  'shield',
  'sparkles',
  'star',
  'sun',
  'terminal',
  'trending-up',
  'trophy',
  'upload',
  'user',
  'users',
  'wallet',
  'wifi',
  'wind',
  'x',
  'zap',
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-accent-green border-b border-border-default pb-2">{title}</h2>
      {children}
    </section>
  );
}

function ToastDemo() {
  const { addToast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => addToast({ title: 'Sync completed!', variant: 'success' })}>
        Success Toast
      </Button>
      <Button size="sm" variant="danger" onClick={() => addToast({ title: 'Connection lost', variant: 'error' })}>
        Error Toast
      </Button>
      <Button size="sm" variant="secondary" onClick={() => addToast({ title: 'New peer discovered', variant: 'info' })}>
        Info Toast
      </Button>
      <Button size="sm" variant="ghost" onClick={() => addToast({ title: 'Low credits', variant: 'warning' })}>
        Warning Toast
      </Button>
    </div>
  );
}

function BadgeSection() {
  const { data: stats } = useBoardStats();
  const format = (n: number | undefined) => (n != null ? n.toLocaleString() : '-');
  return (
    <Section title="Badge">
      <div className="flex flex-wrap gap-3">
        <Badge variant="online" dot>
          Online ({format(stats?.online_peers)})
        </Badge>
        <Badge variant="offline" dot>
          Offline ({format(stats?.offline_peers)})
        </Badge>
        <Badge variant="seeding" dot>
          Seeding ({format(stats?.total_seeders)})
        </Badge>
        <Badge variant="leeching" dot>
          Leeching ({format(stats?.total_leechers)})
        </Badge>
        <Badge variant="verified">Verified</Badge>
        <Badge variant="danger">Danger</Badge>
      </div>
    </Section>
  );
}

export default function DesignSystemPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['skill']));
  const [modalOpen, setModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const toggleFilter = (f: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(f)) {
        next.delete(f);
      } else {
        next.add(f);
      }
      return next;
    });
  };

  return (
    <main className="min-h-screen pb-16">
      <Container className="space-y-12 py-8">
        <div>
          <h1 className="text-3xl font-bold text-accent-green text-glow">StonkAgents Design System</h1>
          <p className="mt-2 text-text-secondary">Visual verification of all Phase 1 UI components</p>
        </div>

        {/* ---- Icons ---- */}
        <Section title="Icon">
          <p className="text-sm text-text-secondary">
            {sampleIcons.length} icons from Untitled UI PRO sprite: stroke-based, 24x24, currentColor
          </p>
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-3">
            {sampleIcons.map(name => (
              <Tooltip key={name} content={name}>
                <div className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-bg-secondary transition-colors">
                  <Icon name={name} size="lg" className="text-text-primary" />
                  <span className="text-[10px] text-text-tertiary truncate w-full text-center">{name}</span>
                </div>
              </Tooltip>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4">
            <span className="text-xs text-text-secondary">Sizes:</span>
            <div className="flex items-end gap-3">
              <div className="flex flex-col items-center gap-1">
                <Icon name="zap" size="sm" className="text-accent-green" />
                <span className="text-[10px] text-text-tertiary">sm</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Icon name="zap" size="default" className="text-accent-green" />
                <span className="text-[10px] text-text-tertiary">default</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Icon name="zap" size="lg" className="text-accent-green" />
                <span className="text-[10px] text-text-tertiary">lg</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Icon name="zap" size="xl" className="text-accent-green" />
                <span className="text-[10px] text-text-tertiary">xl</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ---- Buttons ---- */}
        <Section title="Button">
          <div className="space-y-4">
            <p className="text-xs text-text-secondary">Variants</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <p className="text-xs text-text-secondary">Sizes</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
            </div>
            <p className="text-xs text-text-secondary">With icons, loading, disabled</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button icon="download">With Icon</Button>
              <Button icon="send" variant="secondary">
                Send
              </Button>
              <Button iconRight="zap" variant="ghost">
                Zap Right
              </Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Section>

        {/* ---- Badge ---- */}
        <BadgeSection />

        {/* ---- Card ---- */}
        <Section title="Card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card hover>
              <Card.Header>
                <span className="text-sm font-semibold">Peer Stats</span>
                <Badge variant="online" dot>
                  Live
                </Badge>
              </Card.Header>
              <Card.Body>
                <p className="text-sm text-text-secondary">Connected to 42 agents across the Network.</p>
              </Card.Body>
            </Card>
            <Card>
              <Card.Header>
                <span className="text-sm font-semibold">Credit Balance</span>
              </Card.Header>
              <Card.Body>
                <span className="text-3xl font-bold text-accent-green">1,247</span>
                <p className="text-xs text-text-secondary mt-1">+12% this week</p>
              </Card.Body>
            </Card>
          </div>
        </Section>

        {/* ---- Input ---- */}
        <Section title="Input">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <Input
              label="Search Agents"
              placeholder="Search by name or ID..."
              icon="search"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
            />
            <Input label="Wallet Address" placeholder="0x..." icon="wallet" />
            <Input label="With Error" placeholder="Enter something..." error="This field is required" defaultValue="bad input" />
            <Input label="Disabled" placeholder="Cannot edit" disabled />
          </div>
        </Section>

        {/* ---- Stat ---- */}
        <Section title="Stat">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total Peers" value="1,247" icon="users" trend={{ value: 12, label: 'this week' }} />
            <Stat label="Credits Earned" value="8,432" icon="zap" trend={{ value: 5.2 }} />
            <Stat label="Files Synced" value="342" icon="download" />
            <Stat label="Failed Transfers" value="3" icon="alert-triangle" trend={{ value: -15 }} />
          </div>
        </Section>

        {/* ---- ProgressBar ---- */}
        <Section title="ProgressBar">
          <div className="space-y-4 max-w-lg">
            <ProgressBar value={75} color="green" label="Upload Progress" showValue />
            <ProgressBar value={45} color="blue" label="Download" showValue />
            <ProgressBar value={90} color="yellow" label="Storage Used" showValue />
            <ProgressBar value={15} color="red" label="Failed" showValue />
          </div>
        </Section>

        {/* ---- Table ---- */}
        <Section title="Table">
          <Card>
            <Table>
              <Table.Head>
                <Table.Row>
                  <Table.TH>Agent ID</Table.TH>
                  <Table.TH>Status</Table.TH>
                  <Table.TH>Reputation</Table.TH>
                  <Table.TH align="right">Bandwidth</Table.TH>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                <Table.Row>
                  <Table.TD>agent_7x9k2m</Table.TD>
                  <Table.TD>
                    <Badge variant="online" dot>
                      Online
                    </Badge>
                  </Table.TD>
                  <Table.TD>0.95</Table.TD>
                  <Table.TD align="right">12.4 MB/s</Table.TD>
                </Table.Row>
                <Table.Row>
                  <Table.TD>agent_3f8n1p</Table.TD>
                  <Table.TD>
                    <Badge variant="seeding" dot>
                      Seeding
                    </Badge>
                  </Table.TD>
                  <Table.TD>0.88</Table.TD>
                  <Table.TD align="right">8.2 MB/s</Table.TD>
                </Table.Row>
                <Table.Row>
                  <Table.TD>agent_q2w5e8</Table.TD>
                  <Table.TD>
                    <Badge variant="offline" dot>
                      Offline
                    </Badge>
                  </Table.TD>
                  <Table.TD>0.72</Table.TD>
                  <Table.TD align="right">-</Table.TD>
                </Table.Row>
              </Table.Body>
            </Table>
          </Card>
        </Section>

        {/* ---- Toast ---- */}
        <Section title="Toast">
          <p className="text-sm text-text-secondary mb-2">
            Click buttons to trigger slide-in toast notifications (auto-dismiss 4s, max 3 stacked):
          </p>
          <ToastDemo />
        </Section>

        {/* ---- Update Banner ---- */}
        <Section title="Update Banner">
          <p className="text-sm text-text-secondary mb-4">
            Auto-update lifecycle states. IDLE and CANCELLED render nothing (banner hides).
          </p>
          <div className="space-y-3">
            {allMockUpdateStates.map(({ label, data }) => (
              <div key={label}>
                <p className="text-xs text-text-tertiary mb-1">
                  {label}: {data.state}
                  {data.force ? ' (force)' : ''}
                </p>
                <div className="rounded-md border border-border-default overflow-hidden">
                  <UpdateBanner status={data} onStartUpdate={() => {}} onCancelUpdate={() => {}} onDismiss={() => {}} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ---- Tooltip ---- */}
        <Section title="Tooltip">
          <div className="flex gap-6">
            <Tooltip content="View peer details" position="top">
              <Button variant="ghost" icon="user">
                Hover me (top)
              </Button>
            </Tooltip>
            <Tooltip content="Download asset" position="bottom">
              <Button variant="ghost" icon="download">
                Hover me (bottom)
              </Button>
            </Tooltip>
          </div>
        </Section>

        {/* ---- TabBar ---- */}
        <Section title="TabBar">
          <TabBar
            tabs={[
              { id: 'all', label: 'All Assets', count: 156 },
              { id: 'skills', label: 'Skills', count: 42 },
              { id: 'prompts', label: 'Prompts', count: 38 },
              { id: 'memory', label: 'Memory', count: 27 },
              { id: 'workflows', label: 'Workflows', count: 15 },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
          <p className="text-sm text-text-secondary mt-3">
            Active tab: <span className="text-accent-green">{activeTab}</span>
          </p>
        </Section>

        {/* ---- FilterChip ---- */}
        <Section title="FilterChip">
          <div className="flex flex-wrap gap-2">
            {['skill', 'prompt', 'memory', 'workflow', 'context', 'tool'].map(f => (
              <FilterChip key={f} label={`.agent-${f}`} active={activeFilters.has(f)} onClick={() => toggleFilter(f)} />
            ))}
          </div>
        </Section>

        {/* ---- Modal ---- */}
        <Section title="Modal">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open Modal
          </Button>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Confirm Action">
            <p className="text-sm text-text-secondary mb-4">
              Are you sure you want to drop this asset from the Network? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                Drop Asset
              </Button>
            </div>
          </Modal>
        </Section>

        {/* ---- PageHeader ---- */}
        <Section title="PageHeader">
          <Card>
            <PageHeader
              icon="network"
              title="Peer Network"
              subtitle="42 agents connected across the Network"
              action={
                <Button icon="rocket" size="sm">
                  Add Peer
                </Button>
              }
            />
          </Card>
        </Section>

        {/* ---- StonkAgents Mascot / Logo ---- */}
        <Section title="StonkAgents Mascot">
          <p className="text-sm text-text-secondary mb-4">
            Red crab body (#FF4D4D) + neon green pixel sunglasses (#00FF00) = online. Dimmed crab + no glasses = offline. Dual
            red+green glow is the signature look.
          </p>

          <div className="space-y-6">
            <div>
              <p className="text-xs text-text-secondary mb-3">Sizes</p>
              <div className="flex items-end gap-6">
                {(['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const).map(s => (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <ClawMascot size={s} />
                    <span className="text-[10px] text-text-tertiary">{s}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-text-secondary mb-3">Variants</p>
              <div className="flex items-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <ClawMascot size="xl" variant="online" />
                  <span className="text-xs text-text-secondary">Online (Agent Mode)</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <ClawMascot size="xl" variant="offline" />
                  <span className="text-xs text-text-secondary">Offline (Lonely)</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-text-secondary mb-3">Logo Animations</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <div className="flex flex-col items-center gap-3 py-4">
                    <ClawMascot size="lg" animation="spin" />
                    <span className="text-xs text-text-secondary">spin</span>
                  </div>
                </Card>
                <Card>
                  <div className="flex flex-col items-center gap-3 py-4">
                    <ClawMascot size="lg" animation="breathe" />
                    <span className="text-xs text-text-secondary">breathe</span>
                  </div>
                </Card>
                <Card>
                  <div className="flex flex-col items-center gap-3 py-4">
                    <ClawMascot size="lg" animation="bounce" />
                    <span className="text-xs text-text-secondary">bounce</span>
                  </div>
                </Card>
                <Card>
                  <div className="flex flex-col items-center gap-3 py-4">
                    <ClawMascot size="lg" animation="scuttle" />
                    <span className="text-xs text-text-secondary">scuttle</span>
                  </div>
                </Card>
                <Card>
                  <div className="flex flex-col items-center gap-3 py-4">
                    <ClawMascot size="lg" animation="glasses-glint" />
                    <span className="text-xs text-text-secondary">glasses-glint</span>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </Section>

        {/* ---- UI Animations ---- */}
        <Section title="UI Animations">
          <p className="text-sm text-text-secondary mb-4">Component-level keyframes for state transitions, loading, and feedback.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <div className="flex flex-col items-center gap-3 py-4">
                <span className="text-2xl font-bold text-accent-green animate-credit-pop">+50</span>
                <span className="text-xs text-text-secondary">credit-pop</span>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="h-3 w-3 rounded-full bg-accent-green animate-daemon-pulse" />
                <span className="text-xs text-text-secondary">daemon-pulse</span>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="h-10 w-10 rounded-lg bg-accent-red/20 border border-accent-red/40 animate-kill-pulse" />
                <span className="text-xs text-text-secondary">kill-pulse</span>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-accent-green animate-typing-bounce" />
                  <span className="h-2 w-2 rounded-full bg-accent-green animate-typing-bounce [animation-delay:0.2s]" />
                  <span className="h-2 w-2 rounded-full bg-accent-green animate-typing-bounce [animation-delay:0.4s]" />
                </div>
                <span className="text-xs text-text-secondary">typing-bounce</span>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col items-center gap-3 py-4">
                <span className="text-lg font-bold text-accent-green text-glow">glow</span>
                <span className="text-xs text-text-secondary">text-glow</span>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col items-center gap-3 py-4">
                <span className="text-lg font-bold text-accent-red text-glow-red">danger</span>
                <span className="text-xs text-text-secondary">text-glow-red</span>
              </div>
            </Card>
          </div>
        </Section>

        {/* ---- Mobile / Responsive ---- */}
        <Section title="Mobile & Responsive">
          <p className="text-sm text-text-secondary mb-4">
            Resize your browser to see responsive behavior. Breakpoints: sm (375px), md (600px), lg (900px).
          </p>

          <div className="space-y-6">
            <div>
              <p className="text-xs text-text-secondary mb-2">Stat grid: 2-col mobile &rarr; 4-col desktop</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Peers" value="42" icon="users" />
                <Stat label="Credits" value="1.2K" icon="zap" />
                <Stat label="Uploads" value="89" icon="upload" />
                <Stat label="Speed" value="14MB/s" icon="gauge" />
              </div>
            </div>

            <div>
              <p className="text-xs text-text-secondary mb-2">TabBar: horizontal scroll on mobile</p>
              <TabBar
                tabs={[
                  { id: 'overview', label: 'Overview' },
                  { id: 'peers', label: 'Peers', count: 42 },
                  { id: 'assets', label: 'Assets', count: 156 },
                  { id: 'transfers', label: 'Transfers', count: 8 },
                  { id: 'credits', label: 'Credits' },
                  { id: 'settings', label: 'Settings' },
                ]}
                activeTab="overview"
                onTabChange={() => {}}
              />
            </div>

            <div>
              <p className="text-xs text-text-secondary mb-2">Button group: wraps naturally on mobile</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon="download">
                  Download
                </Button>
                <Button size="sm" variant="secondary" icon="share-2">
                  Share
                </Button>
                <Button size="sm" variant="ghost" icon="copy">
                  Copy CID
                </Button>
                <Button size="sm" variant="danger" icon="x-close">
                  Remove
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs text-text-secondary mb-2">FilterChip row: wraps on mobile</p>
              <div className="flex flex-wrap gap-2">
                {['.claw-skill', '.claw-prompt', '.claw-memory', '.claw-workflow', '.vec', '.traj'].map(t => (
                  <FilterChip key={t} label={assetTypeLabel(t)} active={t === '.claw-skill'} />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-text-secondary mb-2">PageHeader: stacks on mobile, inline on desktop</p>
              <Card>
                <PageHeader
                  icon="terminal"
                  title="Agent Board"
                  subtitle="Manage your autonomous agents"
                  action={
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" icon="settings">
                        Config
                      </Button>
                      <Button size="sm" icon="rocket">
                        Deploy
                      </Button>
                    </div>
                  }
                />
              </Card>
            </div>

            <div>
              <p className="text-xs text-text-secondary mb-2">Table: horizontal scroll on mobile</p>
              <Card>
                <Table>
                  <Table.Head>
                    <Table.Row>
                      <Table.TH>Asset</Table.TH>
                      <Table.TH>Type</Table.TH>
                      <Table.TH>Seeders</Table.TH>
                      <Table.TH>Size</Table.TH>
                      <Table.TH align="right">Actions</Table.TH>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    <Table.Row>
                      <Table.TD>gpt4-coding-v2</Table.TD>
                      <Table.TD>
                        <Badge variant="verified">.agent-skill</Badge>
                      </Table.TD>
                      <Table.TD>24</Table.TD>
                      <Table.TD>1.2 MB</Table.TD>
                      <Table.TD align="right">
                        <Button size="sm" variant="ghost" icon="download">
                          Get
                        </Button>
                      </Table.TD>
                    </Table.Row>
                    <Table.Row>
                      <Table.TD>react-patterns</Table.TD>
                      <Table.TD>
                        <Badge variant="seeding">.agent-prompt</Badge>
                      </Table.TD>
                      <Table.TD>18</Table.TD>
                      <Table.TD>340 KB</Table.TD>
                      <Table.TD align="right">
                        <Button size="sm" variant="ghost" icon="download">
                          Get
                        </Button>
                      </Table.TD>
                    </Table.Row>
                  </Table.Body>
                </Table>
              </Card>
            </div>
          </div>
        </Section>
      </Container>
    </main>
  );
}
