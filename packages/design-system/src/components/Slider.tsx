import * as React from 'react'
import type { InputHTMLAttributes } from 'react'
import { cx } from '../internal/cx'

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  onValueChange?(value: number): void
}

export function Slider({
  className,
  defaultValue,
  max = 100,
  min = 0,
  onValueChange,
  style,
  value,
  ...props
}: SliderProps): React.JSX.Element {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
    Number(defaultValue ?? min)
  )
  const currentValue = Number(value ?? uncontrolledValue)
  const numericMin = Number(min)
  const numericMax = Number(max)
  const position =
    numericMax === numericMin
      ? 0
      : Math.min(100, Math.max(0, ((currentValue - numericMin) / (numericMax - numericMin)) * 100))
  const sliderStyle = {
    ...style,
    '--kw-slider-position': `${position}%`
  } as React.CSSProperties

  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={currentValue}
      style={sliderStyle}
      className={cx('kw-slider', className)}
      onChange={(event) => {
        const next = event.currentTarget.valueAsNumber
        if (value === undefined) setUncontrolledValue(next)
        onValueChange?.(next)
      }}
    />
  )
}
