import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode
} from 'react'
import { cx } from '../internal/cx'

interface DisclosureContextValue {
  open: boolean
  contentId?: string
  setContentId(id: string | undefined): void
  toggle(): void
}

const DisclosureContext = createContext<DisclosureContextValue | null>(null)

function useDisclosureContext(): DisclosureContextValue {
  const context = useContext(DisclosureContext)
  if (!context) throw new Error('Disclosure components must be used inside Disclosure.Root')
  return context
}

interface RootProps {
  open: boolean
  onOpenChange?(open: boolean): void
  children?: ReactNode
}

function Root({ open, onOpenChange, children }: RootProps): React.JSX.Element {
  const [contentId, setContentId] = useState<string>()
  return (
    <DisclosureContext.Provider
      value={{ open, contentId, setContentId, toggle: () => onOpenChange?.(!open) }}
    >
      {children}
    </DisclosureContext.Provider>
  )
}

interface TriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  children: ReactNode
}

function Trigger({ asChild = false, children, ...props }: TriggerProps): React.JSX.Element {
  const { open, contentId, toggle } = useDisclosureContext()
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      {...props}
      type={asChild ? props.type : (props.type ?? 'button')}
      aria-expanded={open}
      aria-controls={contentId}
      onClick={(event) => {
        props.onClick?.(event)
        if (!event.defaultPrevented) toggle()
      }}
    >
      {children}
    </Component>
  )
}

interface ContentProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
  id?: string
}

function Content({ children, id, className, ...props }: ContentProps): React.JSX.Element {
  const { open, setContentId } = useDisclosureContext()
  const content = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const generatedId = useId()
  const resolvedId = id ?? `kw-disclosure-${generatedId.replace(/:/g, '')}`

  useLayoutEffect(() => {
    setContentId(resolvedId)
    return () => setContentId(undefined)
  }, [resolvedId, setContentId])

  useLayoutEffect(() => {
    const element = content.current
    if (!element) return
    const measure = (): void => setContentHeight(element.scrollHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(open))
    return () => cancelAnimationFrame(frame)
  }, [open])

  const visible = open && revealed
  return (
    <div
      {...props}
      id={resolvedId}
      aria-hidden={!open}
      data-disclosure
      data-state={open ? 'open' : 'closed'}
      className={cx('kw-disclosure', visible && 'is-open', className)}
      style={{ ...props.style, height: visible ? contentHeight : 0 }}
    >
      <div ref={content} className="kw-disclosure-content">
        {children}
      </div>
    </div>
  )
}

interface ChevronProps extends HTMLAttributes<HTMLElement> {
  open?: boolean
  direction?: 'down' | 'right'
  asChild?: boolean
  children?: ReactNode
}

function Chevron({
  open: openProp,
  direction = 'down',
  asChild = false,
  className,
  children,
  ...props
}: ChevronProps): React.JSX.Element {
  const context = useContext(DisclosureContext)
  const open = openProp ?? context?.open ?? false
  const Component = asChild ? Slot : 'span'
  return (
    <Component
      {...props}
      aria-hidden="true"
      data-state={open ? 'open' : 'closed'}
      data-direction={direction}
      className={cx('kw-disclosure-chevron', open && 'is-open', className)}
    >
      {children ?? '›'}
    </Component>
  )
}

export const Disclosure = Object.assign(Root, { Root, Trigger, Content, Chevron })
