import type { ResolvedAppearance } from './types'

const appliedVariables = new WeakMap<HTMLElement, Set<string>>()

export function applyAppearance(element: HTMLElement, appearance: ResolvedAppearance): void {
  element.dataset.colorScheme = appearance.dataset.colorScheme
  element.dataset.accent = appearance.dataset.accent
  element.dataset.wallpaper = appearance.dataset.wallpaper

  const previous = appliedVariables.get(element) ?? new Set<string>()
  const next = new Set(Object.keys(appearance.vars))
  for (const name of previous) {
    if (!next.has(name)) element.style.removeProperty(name)
  }
  for (const [name, value] of Object.entries(appearance.vars)) {
    element.style.setProperty(name, value)
  }
  appliedVariables.set(element, next)
}
