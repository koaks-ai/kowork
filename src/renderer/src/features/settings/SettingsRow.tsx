import type { PropsWithChildren } from 'react'

export const settingsControlClassName =
  'h-9 w-[240px] rounded-md border border-kw-border-default bg-kw-surface px-2.5 text-sm text-kw-text-secondary outline-none focus-visible:border-kw-accent focus-visible:ring-1 focus-visible:ring-kw-focus-ring'

export function SettingsPaneHeader({
  title,
  description
}: {
  title: string
  description: string
}): React.JSX.Element {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-kw-text-primary">{title}</h2>
      <p className="mt-1 text-sm text-kw-text-muted">{description}</p>
    </div>
  )
}

export function SettingsRow({
  label,
  description,
  htmlFor,
  children
}: PropsWithChildren<{
  label: string
  description?: string
  htmlFor?: string
}>): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="text-sm font-medium text-kw-text-primary">
          {label}
        </label>
        {description ? <p className="mt-1 text-xs text-kw-text-muted">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
