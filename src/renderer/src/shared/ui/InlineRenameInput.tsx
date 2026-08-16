import { useEffect, useRef, useState } from 'react'

interface InlineRenameInputProps {
  value: string
  placeholder?: string
  className?: string
  'aria-label'?: string
  onSubmit(value: string): void
  onCancel(): void
}

export function InlineRenameInput({
  value,
  placeholder,
  className = '',
  'aria-label': ariaLabel,
  onSubmit,
  onCancel
}: InlineRenameInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const finished = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  const finish = (next: 'submit' | 'cancel'): void => {
    if (finished.current) return
    finished.current = true
    if (next === 'cancel') {
      onCancel()
      return
    }
    const title = draft.trim()
    if (!title || title === value.trim()) {
      onCancel()
      return
    }
    onSubmit(title)
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-thread-title-input
      className={className}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          finish('submit')
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          finish('cancel')
        }
      }}
      onBlur={() => finish('submit')}
    />
  )
}
