import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Cpu, Palette, Settings, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AppBootstrapDto,
  AppSettingsDto,
  ModelProfileDto,
  ProviderDto
} from '@kowork/contracts'
import { IconButton, Reveal, SelectableItem, SelectableList, Surface } from '@kowork/design-system'
import { GeneralSettingsPane } from './GeneralSettingsPane'
import { ModelSettingsPane } from './ModelSettingsPane'
import { AppearanceSettingsPane } from './appearance/AppearanceSettingsPane'

type SettingsSection = 'general' | 'appearance' | 'model'

const SETTINGS_NAV = [
  { id: 'general', icon: SlidersHorizontal, labelKey: 'settingsGeneral' },
  { id: 'appearance', icon: Palette, labelKey: 'settingsAppearance' },
  { id: 'model', icon: Cpu, labelKey: 'settingsModel' }
] as const

export function SettingsDialog({
  providers,
  profiles,
  settings
}: {
  providers: ProviderDto[]
  profiles: ModelProfileDto[]
  settings: AppSettingsDto
}): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [section, setSection] = useState<SettingsSection>('general')
  const updateSettings = useMutation({
    mutationFn: (changes: Partial<AppSettingsDto>) => window.kowork.settings.update(changes),
    onSuccess: (updated) =>
      queryClient.setQueryData<AppBootstrapDto>(['bootstrap'], (current) =>
        current ? { ...current, settings: updated } : current
      )
  })

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <IconButton label={t('settings')}>
          <Settings size={17} />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <Reveal asChild variant="overlay">
            <div className="fixed inset-0 z-40" />
          </Reveal>
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <Reveal asChild variant="dialog">
            <div data-settings-dialog className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none">
              <Surface variant="dialog" className="pointer-events-auto flex h-[min(780px,calc(100vh-32px))] w-[min(1040px,calc(100vw-32px))] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-kw-border-default px-5 py-3">
              <Dialog.Title className="text-base font-semibold text-kw-text-primary">
                {t('settings')}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                {t('settingsDescription')}
              </Dialog.Description>
              <Dialog.Close asChild>
                <IconButton label={t('close')}>
                  <X size={17} />
                </IconButton>
              </Dialog.Close>
            </div>

            <div className="flex min-h-0 flex-1">
              <nav
                aria-label={t('settings')}
                className="w-[220px] shrink-0 border-r border-kw-border-default bg-kw-surface-subtle p-3"
              >
                <SelectableList value={section} selectionStyle="sliding" className="flex flex-col gap-1">
                  {SETTINGS_NAV.map((item) => {
                    const selected = section === item.id
                    const Icon = item.icon
                    return (
                      <SelectableItem key={item.id} value={item.id} asChild>
                      <button
                        type="button"
                        aria-current={selected ? 'page' : undefined}
                        className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none ${
                          selected ? 'text-kw-text-primary' : 'text-kw-text-secondary'
                        }`}
                        onClick={() => setSection(item.id)}
                      >
                        <Icon size={16} className="shrink-0" />
                        <span className="min-w-0 flex-1 font-medium">{t(item.labelKey)}</span>
                      </button>
                      </SelectableItem>
                    )
                  })}
                </SelectableList>
              </nav>

              <div className="relative min-h-0 flex-1 overflow-hidden">
                {section === 'general' ? (
                    <Reveal className="h-full" contentKey="general">
                    <GeneralSettingsPane
                      settings={settings}
                      onUpdate={(changes) => updateSettings.mutate(changes)}
                    />
                    </Reveal>
                ) : section === 'appearance' ? (
                  <Reveal className="h-full" contentKey="appearance">
                    <AppearanceSettingsPane />
                  </Reveal>
                ) : (
                  <Reveal className="flex h-full min-h-0 flex-col" contentKey="model">
                    <ModelSettingsPane
                      providers={providers}
                      profiles={profiles}
                      settings={settings}
                      onUpdate={(changes) => updateSettings.mutate(changes)}
                    />
                  </Reveal>
                )}
              </div>
            </div>
              </Surface>
            </div>
          </Reveal>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
