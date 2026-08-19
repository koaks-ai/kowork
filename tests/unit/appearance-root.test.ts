// @vitest-environment jsdom
/* eslint-disable react/no-children-prop -- React 19 requires required children in createElement props. */

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CLIENT_SETTINGS,
  type Accent,
  type ClientSettingsErrorDto,
  type ClientSettingsState,
  type ResolvedColorScheme
} from '@kowork/client-settings'
import { AppearanceRoot } from '../../src/renderer/src/app/appearance/AppearanceRoot'

let mockStore: {
  state: ClientSettingsState
  mutationError: ClientSettingsErrorDto | null
}

vi.mock('../../src/renderer/src/app/appearance/appearance-store', () => ({
  useAppearanceStore: () => mockStore,
  dismissAppearanceMutationError: vi.fn(),
  resetClientSettings: vi.fn()
}))

function readyState(accent: Accent, resolvedColorScheme: ResolvedColorScheme): ClientSettingsState {
  return {
    status: 'ready',
    snapshot: {
      ...structuredClone(DEFAULT_CLIENT_SETTINGS),
      appearance: {
        ...structuredClone(DEFAULT_CLIENT_SETTINGS.appearance),
        colorScheme: resolvedColorScheme,
        accent
      },
      resolvedColorScheme
    }
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
  delete document.documentElement.dataset.colorScheme
  delete document.documentElement.dataset.accent
  delete document.documentElement.dataset.wallpaper
})

describe('AppearanceRoot', () => {
  it('dismisses the Reveal overlay after every consecutive theme change', () => {
    mockStore = {
      state: readyState({ type: 'preset', id: 'default' }, 'light'),
      mutationError: null
    }
    const root = (): React.ReactElement =>
      createElement(AppearanceRoot, { children: createElement('main', null, 'content') })
    const view = render(root())

    const changes: ClientSettingsState[] = [
      readyState({ type: 'preset', id: 'blue' }, 'light'),
      readyState({ type: 'preset', id: 'violet' }, 'light'),
      readyState({ type: 'preset', id: 'violet' }, 'dark')
    ]

    for (const state of changes) {
      mockStore = { state, mutationError: null }
      act(() => view.rerender(root()))

      const transition = view.container.querySelector('.kw-theme-transition')
      expect(transition?.getAttribute('data-state')).toBe('closed')
      fireEvent(transition!, new Event('animationend', { bubbles: true }))
      expect(view.container.querySelector('.kw-theme-transition')).toBeNull()
    }
  })
})
