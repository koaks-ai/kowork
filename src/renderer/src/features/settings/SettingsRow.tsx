import type { PropsWithChildren } from 'react'

export const settingsControlClassName =
  'h-9 w-[240px] rounded-md border border-neutral-200 bg-white px-2.5 text-sm text-neutral-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20'

export function SettingsPaneHeader({
  title,
  description
}: {
  title: string
  description: string
}): React.JSX.Element {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
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
        <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-900">
          {label}
        </label>
        {description ? <p className="mt-1 text-xs text-neutral-500">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
