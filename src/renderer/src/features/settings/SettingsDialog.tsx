import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Cpu, Settings, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AppBootstrapDto,
  AppSettingsDto,
  ModelProfileDto,
  ProviderDto
} from '@kowork/contracts'
import { BlurReveal } from '../../shared/ui/BlurReveal'
import { IconButton } from '../../shared/ui/IconButton'
import { GeneralSettingsPane } from './GeneralSettingsPane'
import { ModelSettingsPane } from './ModelSettingsPane'

type SettingsSection = 'general' | 'model'

const navItemClassName =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-600 outline-none transition-colors duration-150 hover:bg-blue-50 hover:text-neutral-900 aria-[current=page]:bg-blue-50 aria-[current=page]:text-neutral-900'

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
        <Dialog.Overlay className="kowork-settings-overlay fixed inset-0 z-40" />
        <Dialog.Content className="kowork-settings-dialog fixed inset-0 z-50 flex items-center justify-center p-4 outline-none">
          <div className="pointer-events-auto flex h-[min(780px,calc(100vh-32px))] w-[min(1040px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
              <Dialog.Title className="text-base font-semibold text-neutral-900">
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
                className="flex w-[220px] shrink-0 flex-col gap-1 border-r border-neutral-200 bg-neutral-50/70 p-3"
              >
                <button
                  type="button"
                  aria-current={section === 'general' ? 'page' : undefined}
                  className={navItemClassName}
                  onClick={() => setSection('general')}
                >
                  <SlidersHorizontal size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 font-medium">{t('settingsGeneral')}</span>
                </button>
                <button
                  type="button"
                  aria-current={section === 'model' ? 'page' : undefined}
                  className={navItemClassName}
                  onClick={() => setSection('model')}
                >
                  <Cpu size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 font-medium">{t('settingsModel')}</span>
                </button>
              </nav>

              <div className="relative min-h-0 flex-1 overflow-hidden">
                {section === 'general' ? (
                  <BlurReveal className="h-full" contentKey="general">
                    <GeneralSettingsPane
                      settings={settings}
                      onUpdate={(changes) => updateSettings.mutate(changes)}
                    />
                  </BlurReveal>
                ) : (
                  <BlurReveal className="flex h-full min-h-0 flex-col" contentKey="model">
                    <ModelSettingsPane
                      providers={providers}
                      profiles={profiles}
                      settings={settings}
                      onUpdate={(changes) => updateSettings.mutate(changes)}
                    />
                  </BlurReveal>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
