import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BlurReveal } from './BlurReveal'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  destructive?: boolean
  separatorBefore?: boolean
  onSelect(): void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose(): void
}

const BLUR_REVEAL_EXIT_MS = 220

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [position, setPosition] = useState({ left: x, top: y })
  const [leaving, setLeaving] = useState(false)
  onCloseRef.current = onClose

  const requestClose = useCallback((): void => {
    setLeaving(true)
  }, [])

  useEffect(() => {
    setLeaving(false)
  }, [x, y])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => onCloseRef.current(), BLUR_REVEAL_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const margin = 8
    setPosition({
      left: Math.min(x, Math.max(margin, window.innerWidth - rect.width - margin)),
      top: Math.min(y, Math.max(margin, window.innerHeight - rect.height - margin))
    })
  }, [x, y])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button === 2) return
      if (!menuRef.current?.contains(event.target as Node)) requestClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') requestClose()
    }
    const onContextMenu = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) requestClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('contextmenu', onContextMenu)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('contextmenu', onContextMenu)
    }
  }, [requestClose])

  return createPortal(
    <div
      ref={menuRef}
      className={`fixed z-[70] ${leaving ? 'pointer-events-none' : ''}`}
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <BlurReveal className="h-full" state={leaving ? 'closed' : 'open'}>
        <div
          role="menu"
          data-context-menu
          className="min-w-40 rounded-xl border border-neutral-200 bg-white p-1 shadow-xl"
        >
          {items.map((item) => (
            <div key={item.id}>
              {item.separatorBefore ? (
                <div className="my-1 h-px bg-neutral-100" role="separator" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none ${
                  item.destructive
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
                onClick={() => {
                  item.onSelect()
                  requestClose()
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      </BlurReveal>
    </div>,
    document.body
  )
}
