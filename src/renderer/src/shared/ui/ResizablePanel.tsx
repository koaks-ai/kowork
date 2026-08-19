import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from 'react'
import type { ClientLayoutKey } from '@kowork/client-settings'
import { updateLayoutWidth, useAppearanceStore } from '../../app/appearance/appearance-store'

interface ResizablePanelProps {
  side: 'left' | 'right'
  defaultWidth: number
  minWidth: number
  maxWidth: number
  layoutKey: ClientLayoutKey
  resizeLabel: string
  collapsed?: boolean
  className?: string
  children: ReactNode
}

interface DragState {
  pointerId: number
  startX: number
  startWidth: number
  latestWidth: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function ResizablePanel({
  side,
  defaultWidth,
  minWidth,
  maxWidth,
  layoutKey,
  resizeLabel,
  collapsed = false,
  className = '',
  children
}: ResizablePanelProps): React.JSX.Element {
  const appearance = useAppearanceStore()
  const storedWidth =
    appearance.state?.status === 'ready'
      ? clamp(appearance.state.snapshot.layout[layoutKey], minWidth, maxWidth)
      : defaultWidth
  const [width, setWidth] = useState(storedWidth)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<DragState | null>(null)

  useEffect(
    () => () => {
      document.documentElement.classList.remove('kowork-panel-resizing')
    },
    []
  )

  useEffect(() => {
    if (!drag.current) setWidth(storedWidth)
  }, [storedWidth])

  const persistWidth = (nextWidth: number): void => {
    void updateLayoutWidth(layoutKey, nextWidth)
  }

  const finishResize = (event: PointerEvent<HTMLDivElement>): void => {
    const currentDrag = drag.current
    if (currentDrag?.pointerId !== event.pointerId) return
    const finalWidth = currentDrag.latestWidth
    drag.current = null
    setDragging(false)
    document.documentElement.classList.remove('kowork-panel-resizing')
    persistWidth(finalWidth)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const resizeFromKeyboard = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = 12
    let nextWidth: number | undefined

    if (event.key === 'ArrowLeft') nextWidth = width + (side === 'left' ? -step : step)
    if (event.key === 'ArrowRight') nextWidth = width + (side === 'left' ? step : -step)
    if (event.key === 'Home') nextWidth = minWidth
    if (event.key === 'End') nextWidth = maxWidth
    if (nextWidth === undefined) return

    event.preventDefault()
    const clampedWidth = clamp(nextWidth, minWidth, maxWidth)
    setWidth(clampedWidth)
    persistWidth(clampedWidth)
  }

  return (
    <div
      aria-hidden={collapsed || undefined}
      data-collapsed={collapsed || undefined}
      data-resizing={dragging || undefined}
      className={`kw-panel-visibility relative h-full shrink-0 ${className}`}
      style={{ width: collapsed ? 0 : width }}
    >
      <div className="kw-panel-visibility__content" style={{ width }}>
        {children}
      </div>
      <div
        role="separator"
        aria-label={resizeLabel}
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        data-dragging={dragging || undefined}
        className={`no-drag group absolute inset-y-0 z-30 w-2 cursor-col-resize touch-none outline-none ${side === 'left' ? '-right-1' : '-left-1'}`}
        onDoubleClick={() => {
          setWidth(defaultWidth)
          persistWidth(defaultWidth)
        }}
        onKeyDown={resizeFromKeyboard}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: width,
            latestWidth: width
          }
          setDragging(true)
          document.documentElement.classList.add('kowork-panel-resizing')
        }}
        onPointerMove={(event) => {
          const currentDrag = drag.current
          if (currentDrag?.pointerId !== event.pointerId) return
          const direction = side === 'left' ? 1 : -1
          const nextWidth = clamp(
            currentDrag.startWidth + (event.clientX - currentDrag.startX) * direction,
            minWidth,
            maxWidth
          )
          currentDrag.latestWidth = nextWidth
          setWidth(nextWidth)
        }}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onLostPointerCapture={finishResize}
      >
        <span className="kw-resize-handle pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-kw-border-default group-hover:w-[3px] group-hover:bg-kw-border-strong group-focus-visible:w-[3px] group-focus-visible:bg-kw-accent group-data-[dragging=true]:w-[3px] group-data-[dragging=true]:bg-kw-accent" />
      </div>
    </div>
  )
}
