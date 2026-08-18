import * as Tabs from '@radix-ui/react-tabs'
import type { AppSettingsDto, ModelProfileDto, ProviderDto } from '@kowork/contracts'
import { Reveal, SelectableItem, SelectableList, Surface } from '@kowork/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const [tab, setTab] = useState('use')

  return (
    <Tabs.Root value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pt-6">
        <SettingsPaneHeader
          title={t('settingsModel')}
          description={t('settingsModelDescription')}
        />
        <Tabs.List asChild>
          <SelectableList value={tab} orientation="horizontal" selectionStyle="sliding" className="flex h-10 items-end gap-5 border-b border-kw-border-default">
          <Tabs.Trigger
            value="use"
            asChild
          >
            <SelectableItem value="use" asChild><button className="mb-2 inline-flex h-8 items-center rounded-lg px-3 text-sm text-kw-text-muted data-[state=active]:font-medium data-[state=active]:text-kw-text-primary">{t('settingsModelUse')}</button></SelectableItem>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="access"
            asChild
          >
            <SelectableItem value="access" asChild><button className="mb-2 inline-flex h-8 items-center rounded-lg px-3 text-sm text-kw-text-muted data-[state=active]:font-medium data-[state=active]:text-kw-text-primary">{t('settingsModelAccess')}</button></SelectableItem>
          </Tabs.Trigger>
          </SelectableList>
        </Tabs.List>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Tabs.Content value="use" className="h-full overflow-y-auto p-6">
          <Reveal>
            <Surface variant="card" className="divide-y divide-kw-border-subtle overflow-hidden px-5">
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
            </Surface>
          </Reveal>
        </Tabs.Content>

        <Tabs.Content value="access" className="flex h-full min-h-0 flex-col">
          <Reveal className="flex min-h-0 flex-1 flex-col">
            <ProviderSettings providers={providers} profiles={profiles} />
          </Reveal>
        </Tabs.Content>
      </div>
    </Tabs.Root>
  )
}
