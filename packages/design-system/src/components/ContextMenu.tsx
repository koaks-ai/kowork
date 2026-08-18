import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import * as React from 'react'
import { Reveal } from './Reveal'

interface ContextMenuContextValue {
  queueSelection(action: () => void): void
  clearSelection(): void
  takeSelection(): (() => void) | null
}

const ContextMenuContext = React.createContext<ContextMenuContextValue | null>(null)

function Root(props: React.ComponentProps<typeof ContextMenuPrimitive.Root>): React.JSX.Element {
  const pendingSelection = React.useRef<(() => void) | null>(null)
  const context = React.useMemo<ContextMenuContextValue>(
    () => ({
      queueSelection: (action) => {
        pendingSelection.current = action
      },
      clearSelection: () => {
        pendingSelection.current = null
      },
      takeSelection: () => {
        const action = pendingSelection.current
        pendingSelection.current = null
        return action
      }
    }),
    []
  )
  return (
    <ContextMenuContext.Provider value={context}>
      <ContextMenuPrimitive.Root
        {...props}
        onOpenChange={(open) => {
          if (open) context.clearSelection()
          props.onOpenChange?.(open)
        }}
      />
    </ContextMenuContext.Provider>
  )
}

function Trigger(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>
): React.JSX.Element {
  return <ContextMenuPrimitive.Trigger {...props} />
}

function Content({
  children,
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>): React.JSX.Element {
  const context = React.useContext(ContextMenuContext)
  return (
    <ContextMenuPrimitive.Content
      {...props}
      asChild
      onCloseAutoFocus={(event) => {
        props.onCloseAutoFocus?.(event)
        const action = context?.takeSelection()
        if (action) queueMicrotask(action)
      }}
    >
      <Reveal asChild className="kw-context-menu">
        <div className={className}>{children}</div>
      </Reveal>
    </ContextMenuPrimitive.Content>
  )
}

interface ItemProps extends React.ComponentProps<typeof ContextMenuPrimitive.Item> {
  destructive?: boolean
}

function Item({
  children,
  className,
  destructive = false,
  ...props
}: ItemProps): React.JSX.Element {
  const context = React.useContext(ContextMenuContext)
  const onSelect = props.onSelect
  const itemProps = { ...props }
  delete itemProps.onSelect
  return (
    <ContextMenuPrimitive.Item
      {...itemProps}
      asChild
      onSelect={(event) => {
        if (context && onSelect) context.queueSelection(() => onSelect(event))
        else onSelect?.(event)
      }}
    >
      <button
        type="button"
        data-selectable-item
        data-selection-style="fill"
        data-destructive={destructive || undefined}
        className={`kw-selectable-item kw-menu-item${destructive ? ' is-destructive' : ''}${className ? ` ${className}` : ''}`}
      >
        {children}
      </button>
    </ContextMenuPrimitive.Item>
  )
}

function Separator(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Separator>
): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Separator
      {...props}
      className={`kw-menu-separator${props.className ? ` ${props.className}` : ''}`}
    />
  )
}

function Portal(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Portal>
): React.JSX.Element {
  return <ContextMenuPrimitive.Portal {...props} />
}

export const ContextMenu = Object.assign(Root, {
  Root,
  Trigger,
  Portal,
  Content,
  Item,
  Separator
})
