import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode
} from 'react'
import { cx } from '../internal/cx'

type Orientation = 'vertical' | 'horizontal'
type SelectionStyle = 'sliding' | 'fill'

interface ItemRegistration {
  value: string
  element: HTMLElement
}

interface SelectableContextValue {
  selectedValue?: string
  selectionStyle: SelectionStyle
  register(item: ItemRegistration): () => void
}

const SelectableContext = createContext<SelectableContextValue | null>(null)

export interface SelectableListProps extends HTMLAttributes<HTMLDivElement> {
  value?: string
  orientation?: Orientation
  selectionStyle?: SelectionStyle
  children: ReactNode
}

export function SelectableList({
  value,
  orientation = 'vertical',
  selectionStyle = 'sliding',
  children,
  className,
  ...props
}: SelectableListProps): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const items = useRef(new Map<string, HTMLElement>())
  const firstHighlightMeasured = useRef(false)
  const [highlight, setHighlight] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    opacity: 0,
    borderRadius: ''
  })
  const [highlightReady, setHighlightReady] = useState(false)

  const register = useCallback((item: ItemRegistration) => {
    items.current.set(item.value, item.element)
    return () => items.current.delete(item.value)
  }, [])

  const measure = useCallback(() => {
    if (selectionStyle !== 'sliding' || !value || !root.current) {
      setHighlight((current) => ({ ...current, opacity: 0 }))
      return
    }
    const element = items.current.get(value)
    if (!element) {
      setHighlight((current) => ({ ...current, opacity: 0 }))
      return
    }
    const rootRect = root.current.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    const borderRadius = window.getComputedStyle(element).borderRadius
    if (!firstHighlightMeasured.current) {
      firstHighlightMeasured.current = true
      setHighlightReady(false)
    }
    setHighlight({
      x: rect.left - rootRect.left - root.current.clientLeft,
      y: rect.top - rootRect.top - root.current.clientTop,
      width: rect.width,
      height: rect.height,
      opacity: 1,
      borderRadius
    })
  }, [selectionStyle, value])

  useLayoutEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined' || !root.current) return
    const observer = new ResizeObserver(measure)
    observer.observe(root.current)
    items.current.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [measure, children])

  useEffect(() => {
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [measure])

  useEffect(() => {
    if (!firstHighlightMeasured.current || highlightReady) return
    const frame = requestAnimationFrame(() => setHighlightReady(true))
    return () => cancelAnimationFrame(frame)
  }, [highlight.opacity, highlightReady])

  return (
    <SelectableContext.Provider value={{ selectedValue: value, selectionStyle, register }}>
      <div
        {...props}
        ref={root}
        data-selectable-list
        data-orientation={orientation}
        data-selection-style={selectionStyle}
        className={cx('kw-selectable-list', className)}
      >
        {selectionStyle === 'sliding' ? (
          <span
            aria-hidden="true"
            data-selection-highlight
            data-highlight-ready={highlightReady || undefined}
            className="kw-selectable-highlight"
            style={{
              width: highlight.width,
              height: highlight.height,
              transform: `translate3d(${highlight.x}px, ${highlight.y}px, 0)`,
              opacity: highlight.opacity,
              borderRadius: highlight.borderRadius || undefined
            }}
          />
        ) : null}
        {children}
      </div>
    </SelectableContext.Provider>
  )
}

export interface SelectableItemProps extends HTMLAttributes<HTMLElement> {
  value?: string
  selected?: boolean
  destructive?: boolean
  asChild?: boolean
  children: ReactNode
}

export function SelectableItem({
  value,
  selected,
  destructive = false,
  asChild = false,
  children,
  className,
  ...props
}: SelectableItemProps): React.JSX.Element {
  const context = useContext(SelectableContext)
  const ref = useRef<HTMLElement>(null)
  const isSelected = selected ?? Boolean(value && context?.selectedValue === value)
  const Component = asChild ? Slot : 'div'

  useLayoutEffect(() => {
    if (!context || !value || !ref.current) return
    return context.register({ value, element: ref.current })
  }, [context, value])

  return (
    <Component
      {...props}
      ref={ref as unknown as React.Ref<HTMLDivElement>}
      data-selectable-item
      data-selected={isSelected || undefined}
      data-selection-style={context?.selectionStyle ?? 'fill'}
      data-destructive={destructive || undefined}
      className={cx(
        'kw-selectable-item',
        isSelected && 'is-selected',
        destructive && 'is-destructive',
        className
      )}
    >
      {children}
    </Component>
  )
}
