import { Surface } from '@kowork/design-system'
import { useTranslation } from 'react-i18next'
import { updateAppearance, useAppearanceStore } from '../../../app/appearance/appearance-store'
import { SettingsPaneHeader, SettingsRow } from '../SettingsRow'
import { AccentField } from './AccentField'
import { ColorSchemeField } from './ColorSchemeField'
import { WallpaperField } from './WallpaperField'

export function AppearanceSettingsPane(): React.JSX.Element {
  const { t } = useTranslation()
  const store = useAppearanceStore()
  if (store.state?.status !== 'ready') return <div />
  const appearance = store.state.snapshot.appearance
  const update = (value: typeof appearance): void => {
    void updateAppearance(value)
  }
  return (
    <div className="h-full overflow-y-auto p-6">
      <SettingsPaneHeader
        title={t('settingsAppearance')}
        description={t('settingsAppearanceDescription')}
      />
      <Surface variant="card" className="divide-y divide-kw-border-subtle overflow-hidden px-5">
        <SettingsRow label={t('appearanceColorScheme')}>
          <ColorSchemeField appearance={appearance} onChange={update} />
        </SettingsRow>
        <SettingsRow label={t('appearanceAccent')}>
          <AccentField appearance={appearance} onChange={update} />
        </SettingsRow>
        <SettingsRow label={t('appearanceBackground')}>
          <WallpaperField appearance={appearance} onChange={update} />
        </SettingsRow>
      </Surface>
    </div>
  )
}
