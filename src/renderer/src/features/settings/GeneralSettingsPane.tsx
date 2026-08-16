import type { AppSettingsDto, PermissionMode } from '@kowork/contracts'
import { useTranslation } from 'react-i18next'
import { SettingsPaneHeader, SettingsRow, settingsControlClassName } from './SettingsRow'

export function GeneralSettingsPane({
  settings,
  onUpdate
}: {
  settings: AppSettingsDto
  onUpdate(changes: Partial<AppSettingsDto>): void
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="h-full overflow-y-auto p-6">
      <SettingsPaneHeader
        title={t('settingsGeneral')}
        description={t('settingsGeneralDescription')}
      />
      <section className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 px-5">
        <SettingsRow
          label={t('defaultPermission')}
          description={t('defaultPermissionDescription')}
          htmlFor="settings-default-permission"
        >
          <select
            id="settings-default-permission"
            className={settingsControlClassName}
            value={settings.defaultPermissionMode}
            onChange={(event) =>
              onUpdate({ defaultPermissionMode: event.target.value as PermissionMode })
            }
          >
            <option value="ask">{t('permissionAsk')}</option>
            <option value="auto">{t('permissionAuto')}</option>
            <option value="yolo">{t('permissionYolo')}</option>
          </select>
        </SettingsRow>
      </section>
    </div>
  )
}
