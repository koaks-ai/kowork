import { applyAppearance, resolveAppearance, Reveal } from '@kowork/design-system'
import { useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { X } from 'lucide-react'
import { AppearanceErrorScreen } from './AppearanceErrorScreen'
import { dismissAppearanceMutationError, useAppearanceStore } from './appearance-store'
import { WallpaperLayer } from './WallpaperLayer'

export function AppearanceRoot({ children }: PropsWithChildren): React.JSX.Element {
  const store = useAppearanceStore()
  const previousTheme = useRef<string | undefined>(undefined)
  const nextTransitionId = useRef(0)
  const [transitionId, setTransitionId] = useState<number | null>(null)

  const state = store.state
  // 过渡状态本身会触发额外渲染；稳定解析结果可避免 effect cleanup 取消退出帧并遗留遮罩。
  const appearance = state?.status === 'ready' ? state.snapshot.appearance : undefined
  const resolvedColorScheme =
    state?.status === 'ready' ? state.snapshot.resolvedColorScheme : undefined
  const resolved = useMemo(() => {
    if (!appearance || !resolvedColorScheme) return null
    return resolveAppearance({
      appearance,
      resolvedColorScheme
    })
  }, [appearance, resolvedColorScheme])
  const themeKey = appearance
    ? `${resolvedColorScheme}:${JSON.stringify(appearance.accent)}`
    : undefined

  useLayoutEffect(() => {
    if (!resolved || !themeKey) return
    const changed = previousTheme.current !== undefined && previousTheme.current !== themeKey
    if (changed) setTransitionId(++nextTransitionId.current)
    applyAppearance(document.documentElement, resolved)
    previousTheme.current = themeKey
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
      {transitionId !== null ? (
        <Reveal
          contentKey={transitionId}
          state="closed"
          variant="overlay"
          className="kw-theme-transition"
          onExitComplete={() =>
            setTransitionId((current) => (current === transitionId ? null : current))
          }
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
