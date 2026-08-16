import * as Tabs from '@radix-ui/react-tabs'
import type { AppSettingsDto, ModelProfileDto, ProviderDto } from '@kowork/contracts'
import { useTranslation } from 'react-i18next'
import { BlurReveal } from '../../shared/ui/BlurReveal'
import { ProviderSettings } from './ProviderSettings'
import { SettingsPaneHeader, SettingsRow, settingsControlClassName } from './SettingsRow'

export function ModelSettingsPane({
  providers,
  profiles,
  settings,
  onUpdate
}: {
  providers: ProviderDto[]
  profiles: ModelProfileDto[]
  settings: AppSettingsDto
  onUpdate(changes: Partial<AppSettingsDto>): void
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <Tabs.Root defaultValue="use" className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pt-6">
        <SettingsPaneHeader
          title={t('settingsModel')}
          description={t('settingsModelDescription')}
        />
        <Tabs.List className="flex h-10 items-end gap-5 border-b border-neutral-200">
          <Tabs.Trigger
            value="use"
            className="h-full border-b-2 border-transparent px-1 text-sm text-neutral-500 transition-[color,border-color] duration-150 data-[state=active]:border-blue-600 data-[state=active]:font-medium data-[state=active]:text-blue-700"
          >
            {t('settingsModelUse')}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="access"
            className="h-full border-b-2 border-transparent px-1 text-sm text-neutral-500 transition-[color,border-color] duration-150 data-[state=active]:border-blue-600 data-[state=active]:font-medium data-[state=active]:text-blue-700"
          >
            {t('settingsModelAccess')}
          </Tabs.Trigger>
        </Tabs.List>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Tabs.Content value="use" className="h-full overflow-y-auto p-6">
          <BlurReveal>
            <section className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 px-5">
              <SettingsRow
                label={t('defaultModel')}
                description={t('defaultModelDescription')}
                htmlFor="settings-default-model"
              >
                <select
                  id="settings-default-model"
                  className={settingsControlClassName}
                  value={settings.defaultModelProfileId ?? ''}
                  onChange={(event) =>
                    onUpdate({ defaultModelProfileId: event.target.value || null })
                  }
                >
                  <option value="">{t('automaticModel')}</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id} disabled={!profile.available}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </SettingsRow>
            </section>
          </BlurReveal>
        </Tabs.Content>

        <Tabs.Content value="access" className="flex h-full min-h-0 flex-col">
          <BlurReveal className="flex min-h-0 flex-1 flex-col">
            <ProviderSettings providers={providers} profiles={profiles} />
          </BlurReveal>
        </Tabs.Content>
      </div>
    </Tabs.Root>
  )
}
