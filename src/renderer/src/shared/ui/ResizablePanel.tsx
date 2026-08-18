import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from 'react'

interface ResizablePanelProps {
  side: 'left' | 'right'
  defaultWidth: number
  minWidth: number
  maxWidth: number
  storageKey: string
  resizeLabel: string
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

function readStoredWidth(storageKey: string, fallback: number, min: number, max: number): number {
  try {
    const stored = Number(window.localStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored > 0 ? clamp(stored, min, max) : fallback
  } catch {
    return fallback
  }
}

function storeWidth(storageKey: string, width: number): void {
  try {
    window.localStorage.setItem(storageKey, String(width))
  } catch {
    // Resizing still works when persistent browser storage is unavailable.
  }
}

export function ResizablePanel({
  side,
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
  resizeLabel,
  className = '',
  children
}: ResizablePanelProps): React.JSX.Element {
  const [width, setWidth] = useState(() =>
    readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth)
  )
  const [dragging, setDragging] = useState(false)
  const drag = useRef<DragState | null>(null)

  useEffect(
    () => () => {
      document.documentElement.classList.remove('kowork-panel-resizing')
    },
    []
  )

  const finishResize = (event: PointerEvent<HTMLDivElement>): void => {
    const currentDrag = drag.current
    if (currentDrag?.pointerId !== event.pointerId) return
    const finalWidth = currentDrag.latestWidth
    drag.current = null
    setDragging(false)
    document.documentElement.classList.remove('kowork-panel-resizing')
    storeWidth(storageKey, finalWidth)
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
    storeWidth(storageKey, clampedWidth)
  }

  return (
    <div className={`relative h-full shrink-0 ${className}`} style={{ width }}>
      {children}
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
          storeWidth(storageKey, defaultWidth)
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
