import type { ResolvedColorScheme } from '@kowork/client-settings'
import type { CssVarMap } from './types'

interface Rgb {
  r: number
  g: number
  b: number
}

interface Hsl {
  h: number
  s: number
  l: number
}

function parseHex(hex: string): Rgb {
  if (!/^#[0-9a-f]{6}$/u.test(hex)) {
    throw new TypeError('Custom accent must be a lowercase #rrggbb color')
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  }
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2
  if (delta === 0) return { h: 0, s: 0, l: lightness }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue =
    max === red
      ? ((green - blue) / delta) % 6
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4
  return { h: (hue * 60 + 360) % 360, s: saturation, l: lightness }
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const section = h / 60
  const secondary = chroma * (1 - Math.abs((section % 2) - 1))
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  const offset = l - chroma / 2
  return {
    r: (red + offset) * 255,
    g: (green + offset) * 255,
    b: (blue + offset) * 255
  }
}

function withLightness(color: Hsl, lightness: number, saturation = color.s): Rgb {
  return hslToRgb({ ...color, s: Math.min(1, Math.max(0, saturation)), l: lightness })
}

function luminance({ r, g, b }: Rgb): number {
  const transform = (channel: number): number => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b)
}

function contrastRatio(left: Rgb, right: Rgb): number {
  const lighter = Math.max(luminance(left), luminance(right))
  const darker = Math.min(luminance(left), luminance(right))
  return (lighter + 0.05) / (darker + 0.05)
}

function rgbChannels(color: Rgb): string {
  return `${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)}`
}

export function deriveAccent(hex: string, scheme: ResolvedColorScheme): CssVarMap {
  const accent = parseHex(hex)
  const hsl = rgbToHsl(accent)
  const lightSurface = scheme === 'light'
  const hover = withLightness(hsl, Math.min(1, Math.max(0, hsl.l + (lightSurface ? -0.1 : 0.12))))
  const subtle = withLightness(hsl, lightSurface ? 0.95 : 0.2, Math.min(hsl.s, 0.7))
  const foreground = withLightness(
    hsl,
    lightSurface ? Math.min(hsl.l, 0.38) : Math.max(hsl.l, 0.72)
  )
  const darkContrast = { r: 23, g: 23, b: 23 }
  const lightContrast = { r: 255, g: 255, b: 255 }
  const contrast =
    contrastRatio(accent, darkContrast) >= contrastRatio(accent, lightContrast)
      ? 'rgb(23 23 23)'
      : 'rgb(255 255 255)'
  const interactive = withLightness(
    hsl,
    lightSurface ? Math.min(hsl.l, 0.5) : Math.max(hsl.l, 0.65)
  )
  const channels = rgbChannels(interactive)
  return {
    '--kw-color-accent': toHex(accent),
    '--kw-color-accent-hover': toHex(hover),
    '--kw-color-accent-subtle': toHex(subtle),
    '--kw-color-accent-foreground': toHex(foreground),
    '--kw-color-accent-contrast': contrast,
    '--kw-color-info': toHex(accent),
    '--kw-focus-ring': `rgb(${channels} / 0.45)`,
    '--kw-color-selection-active': `rgb(${channels} / ${lightSurface ? '0.18' : '0.24'})`,
    '--kw-color-selection-hover': `rgb(${channels} / ${lightSurface ? '0.09' : '0.13'})`,
    '--kw-color-selection-active-strong': `rgb(${channels} / ${lightSurface ? '0.27' : '0.34'})`,
    '--kw-color-selection-hover-strong': `rgb(${channels} / ${lightSurface ? '0.14' : '0.2'})`,
    '--kw-color-selection-active-frosted': `rgb(${channels} / ${lightSurface ? '0.22' : '0.3'})`,
    '--kw-color-selection-hover-frosted': `rgb(${channels} / ${lightSurface ? '0.12' : '0.17'})`
  }
}
