import type { AccentId, AppearanceSettings } from '@kowork/client-settings'
import { SelectableItem, SelectableList } from '@kowork/design-system'
import { useTranslation } from 'react-i18next'

const ACCENTS = [
  'default',
  'blue',
  'teal',
  'violet',
  'rose',
  'amber',
  'emerald'
] as const satisfies readonly AccentId[]

export function AccentField({
  appearance,
  onChange
}: {
  appearance: AppearanceSettings
  onChange(value: AppearanceSettings): void
}): React.JSX.Element {
  const { t } = useTranslation()
  const selected = appearance.accent.type === 'preset' ? appearance.accent.id : 'custom'
  return (
    <div className="flex items-center gap-3">
      <SelectableList
        value={selected}
        orientation="horizontal"
        selectionStyle="fill"
        className="flex items-center gap-2"
      >
        {ACCENTS.map((id) => (
          <SelectableItem key={id} value={id} asChild>
            <button
              type="button"
              aria-label={t(`appearanceAccent${id[0]!.toUpperCase()}${id.slice(1)}`)}
              data-accent-option={id}
              className="grid size-9 place-items-center rounded-md border border-kw-border-default"
              onClick={() => onChange({ ...appearance, accent: { type: 'preset', id } })}
            >
              <span className="kw-accent-swatch size-4 rounded-full" />
            </button>
          </SelectableItem>
        ))}
      </SelectableList>
      <label className="flex items-center gap-2 text-xs text-kw-text-secondary">
        {t('appearanceCustomAccent')}
        <input
          key={appearance.accent.type}
          type="color"
          aria-label={t('appearanceCustomAccent')}
          defaultValue={appearance.accent.type === 'custom' ? appearance.accent.hex : undefined}
          className="h-9 w-12 rounded-md border border-kw-border-default bg-kw-surface p-1"
          onChange={(event) =>
            onChange({
              ...appearance,
              accent: { type: 'custom', hex: event.currentTarget.value.toLowerCase() }
            })
          }
        />
      </label>
    </div>
  )
}
