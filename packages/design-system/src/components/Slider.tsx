import * as React from 'react'
import type { InputHTMLAttributes } from 'react'
import { cx } from '../internal/cx'

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  onValueChange?(value: number): void
}

export function Slider({ className, onValueChange, ...props }: SliderProps): React.JSX.Element {
  return (
    <input
      {...props}
      type="range"
      className={cx('kw-slider', className)}
      onChange={(event) => onValueChange?.(event.currentTarget.valueAsNumber)}
    />
  )
}
