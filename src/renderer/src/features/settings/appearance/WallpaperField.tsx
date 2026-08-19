import type { AppearanceSettings } from '@kowork/client-settings'
import { Button, Slider } from '@kowork/design-system'
import { useTranslation } from 'react-i18next'
import { chooseBackground, clearBackground } from '../../../app/appearance/appearance-store'

export function WallpaperField({
  appearance,
  onChange
}: {
  appearance: AppearanceSettings
  onChange(value: AppearanceSettings): void
}): React.JSX.Element {
  const { t } = useTranslation()
  const background = appearance.background
  return (
    <div className="w-[300px] space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => void chooseBackground()}>
          {t('appearanceChooseBackground')}
        </Button>
        <Button variant="ghost" disabled={!background} onClick={() => void clearBackground()}>
          {t('appearanceClearBackground')}
        </Button>
      </div>
      <label className="block text-xs text-kw-text-secondary">
        <span className="mb-1.5 flex items-baseline justify-between gap-4">
          <span>{t('appearanceBlur')}</span>
          <span className="tabular-nums text-kw-text-muted">{background?.blurPx ?? 32}px</span>
        </span>
        <Slider
          aria-label={t('appearanceBlur')}
          min={0}
          max={64}
          step={1}
          disabled={!background}
          value={background?.blurPx ?? 32}
          onValueChange={(blurPx) => {
            if (background) onChange({ ...appearance, background: { ...background, blurPx } })
          }}
        />
      </label>
      <label className="block text-xs text-kw-text-secondary">
        <span className="mb-1.5 flex items-baseline justify-between gap-4">
          <span>{t('appearanceSurfaceOpacity')}</span>
          <span className="tabular-nums text-kw-text-muted">
            {Math.round((background?.surfaceOpacity ?? 0.78) * 100)}%
          </span>
        </span>
        <Slider
          aria-label={t('appearanceSurfaceOpacity')}
          min={0.45}
          max={0.95}
          step={0.01}
          disabled={!background}
          value={background?.surfaceOpacity ?? 0.78}
          onValueChange={(surfaceOpacity) => {
            if (background)
              onChange({ ...appearance, background: { ...background, surfaceOpacity } })
          }}
        />
      </label>
      {!background ? (
        <p className="text-xs text-kw-text-faint">{t('appearanceWallpaperDisabled')}</p>
      ) : null}
    </div>
  )
}
