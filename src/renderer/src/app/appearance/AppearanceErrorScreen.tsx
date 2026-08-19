import { Button } from '@kowork/design-system'
import type { ClientSettingsErrorDto } from '@kowork/client-settings'
import { useState } from 'react'
import { resetClientSettings } from './appearance-store'

export function AppearanceErrorScreen({
  error
}: {
  error: ClientSettingsErrorDto
}): React.JSX.Element {
  const [resetting, setResetting] = useState(false)
  return (
    <main className="grid h-screen place-items-center bg-kw-canvas px-8 text-kw-text-primary">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">外观设置无法读取</h1>
        <p className="mt-2 text-sm text-kw-text-muted">{error.message}</p>
        <p className="mt-1 text-xs text-kw-text-faint">重置会同时恢复主题、背景和面板宽度。</p>
        <Button
          className="mt-5"
          disabled={resetting}
          onClick={() => {
            setResetting(true)
            void resetClientSettings().finally(() => setResetting(false))
          }}
        >
          重置全部外观设置
        </Button>
      </div>
    </main>
  )
}
