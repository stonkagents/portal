/**
 * Purpose: Notification preferences panel for Settings page.
 *          Preset selector (minimal/balanced/everything) and per-category
 *          triage level overrides. Security category has a floor of nudge.
 */
'use client';

import { EVENT_CATEGORIES, CATEGORY_META, PRESET_DEFAULTS } from '@/lib/types/claw-event';
import type { EventCategory, EventTriage, PresetName, NotificationPrefs } from '@/lib/types/claw-event';

interface NotificationPreferencesProps {
  prefs: NotificationPrefs;
  onChange: (prefs: NotificationPrefs) => void;
}

const TRIAGE_OPTIONS: EventTriage[] = ['silent', 'digest', 'nudge', 'alert'];
const SECURITY_OPTIONS: EventTriage[] = ['nudge', 'alert'];

export function NotificationPreferences({ prefs, onChange }: NotificationPreferencesProps) {
  const handlePresetChange = (preset: PresetName) => {
    onChange({ preset, overrides: { ...PRESET_DEFAULTS[preset] } });
  };

  const handleCategoryChange = (category: EventCategory, triage: EventTriage) => {
    onChange({
      ...prefs,
      overrides: { ...prefs.overrides, [category]: triage },
    });
  };

  return (
    <div data-testid="notification-prefs" className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">Notification preset</label>
        <select
          data-testid="prefs-preset"
          value={prefs.preset}
          onChange={e => handlePresetChange(e.target.value as PresetName)}
          className="min-h-[44px] px-3 bg-bg-tertiary border border-border-default rounded-lg text-sm text-text-primary font-mono outline-none focus:border-accent-green/50 cursor-pointer appearance-none"
        >
          <option value="minimal">Minimal (alerts only)</option>
          <option value="balanced">Balanced (recommended)</option>
          <option value="everything">Everything</option>
        </select>
      </div>

      <div>
        <h3 className="text-sm font-medium text-text-primary mb-3">Per-category overrides</h3>
        <div className="space-y-2">
          {EVENT_CATEGORIES.map(category => {
            const meta = CATEGORY_META[category];
            const options = category === 'security' ? SECURITY_OPTIONS : TRIAGE_OPTIONS;
            return (
              <div key={category} className="flex items-center justify-between gap-4">
                <span className="text-sm text-text-secondary">{meta.label}</span>
                <select
                  data-testid={`prefs-category-${category}`}
                  value={prefs.overrides[category]}
                  onChange={e => handleCategoryChange(category, e.target.value as EventTriage)}
                  className="min-h-[36px] px-2 bg-bg-tertiary border border-border-default rounded-lg text-xs text-text-primary font-mono outline-none focus:border-accent-green/50 cursor-pointer appearance-none"
                >
                  {options.map(opt => (
                    <option key={opt} value={opt}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
