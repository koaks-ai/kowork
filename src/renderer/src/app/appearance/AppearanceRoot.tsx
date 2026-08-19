import { applyAppearance, resolveAppearance, Reveal } from '@kowork/design-system'
import { useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react'
import { X } from 'lucide-react'
import { AppearanceErrorScreen } from './AppearanceErrorScreen'
import { dismissAppearanceMutationError, useAppearanceStore } from './appearance-store'
import { WallpaperLayer } from './WallpaperLayer'

export function AppearanceRoot({ children }: PropsWithChildren): React.JSX.Element {
  const store = useAppearanceStore()
  const previousTheme = useRef<string | undefined>(undefined)
  const [transitionVisible, setTransitionVisible] = useState(false)
  const [transitionOpen, setTransitionOpen] = useState(false)

  const state = store.state
  const resolved =
    state?.status === 'ready'
      ? resolveAppearance({
          appearance: state.snapshot.appearance,
          resolvedColorScheme: state.snapshot.resolvedColorScheme
        })
      : null
  const themeKey =
    state?.status === 'ready'
      ? `${resolved?.dataset.colorScheme}:${JSON.stringify(state.snapshot.appearance.accent)}`
      : undefined

  useLayoutEffect(() => {
    if (!resolved || !themeKey) return
    const changed = previousTheme.current !== undefined && previousTheme.current !== themeKey
    if (changed) {
      setTransitionVisible(true)
      setTransitionOpen(true)
    }
    applyAppearance(document.documentElement, resolved)
    previousTheme.current = themeKey
    if (!changed) return
    const frame = requestAnimationFrame(() => setTransitionOpen(false))
    return () => cancelAnimationFrame(frame)
  }, [resolved, themeKey])

  if (!state) {
    return (
      <div className="grid h-screen place-items-center bg-kw-canvas text-sm text-kw-text-muted">
        KoWork
      </div>
    )
  }
  if (state.status === 'error') return <AppearanceErrorScreen error={state.error} />

  return (
    <div className="relative isolate h-full w-full">
      {resolved?.wallpaper ? <WallpaperLayer {...resolved.wallpaper} /> : null}
      {children}
      {transitionVisible ? (
        <Reveal
          state={transitionOpen ? 'open' : 'closed'}
          variant="overlay"
          className="kw-theme-transition"
          onExitComplete={() => setTransitionVisible(false)}
        >
          <span />
        </Reveal>
      ) : null}
      {store.mutationError ? (
        <div
          role="alert"
          className="kw-raised fixed bottom-8 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-kw-danger px-3 py-2 text-xs text-kw-danger shadow-kw-card"
        >
          <span>{store.mutationError.message}</span>
          <button type="button" aria-label="关闭错误" onClick={dismissAppearanceMutationError}>
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
