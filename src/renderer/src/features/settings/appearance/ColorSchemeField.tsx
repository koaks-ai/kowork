import type { AppearanceSettings } from '@kowork/client-settings'
import { SelectableItem, SelectableList } from '@kowork/design-system'
import { useTranslation } from 'react-i18next'

export function ColorSchemeField({
  appearance,
  onChange
}: {
  appearance: AppearanceSettings
  onChange(value: AppearanceSettings): void
}): React.JSX.Element {
  const { t } = useTranslation()
  const options = [
    ['light', t('appearanceLight')],
    ['dark', t('appearanceDark')],
    ['system', t('appearanceSystem')]
  ] as const
  return (
    <SelectableList
      value={appearance.colorScheme}
      orientation="horizontal"
      selectionStyle="fill"
      className="grid grid-cols-3 gap-2"
    >
      {options.map(([value, label]) => (
        <SelectableItem key={value} value={value} asChild>
          <button
            type="button"
            className="h-10 rounded-md border border-kw-border-default px-3 text-sm text-kw-text-secondary data-[selected]:text-kw-text-primary"
            onClick={() => onChange({ ...appearance, colorScheme: value })}
          >
            {label}
          </button>
        </SelectableItem>
      ))}
    </SelectableList>
  )
}
