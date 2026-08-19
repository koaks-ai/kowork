import { useSyncExternalStore } from 'react'
import {
  ClientSettingsError,
  type AppearanceSettings,
  type ClientLayout,
  type ClientLayoutKey,
  type ClientSettingsErrorDto,
  type ClientSettingsBridgeApi,
  type ClientSettingsPatch,
  type ClientSettingsState
} from '@kowork/client-settings'

function clientSettings(): ClientSettingsBridgeApi {
  return (window.kowork as typeof window.kowork & { clientSettings: ClientSettingsBridgeApi })
    .clientSettings
}

interface AppearanceStoreSnapshot {
  state: ClientSettingsState | null
  mutationError: ClientSettingsErrorDto | null
}

let snapshot: AppearanceStoreSnapshot = { state: null, mutationError: null }
const listeners = new Set<() => void>()
let initialized = false
let mutationTail: Promise<void> = Promise.resolve()
let nextMutationRevision = 0
const pendingPatches = new Map<
  ClientSettingsPatch['section'],
  { revision: number; patch: ClientSettingsPatch }
>()

function emit(next: AppearanceStoreSnapshot): void {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function setState(state: ClientSettingsState): void {
  emit({ state, mutationError: null })
}

function applyPendingPatches(state: ClientSettingsState): ClientSettingsState {
  if (state.status !== 'ready' || pendingPatches.size === 0) return state
  let next = state.snapshot
  for (const { patch } of pendingPatches.values()) {
    if (patch.section === 'appearance') {
      next = {
        ...next,
        appearance: patch.value,
        resolvedColorScheme:
          patch.value.colorScheme === 'system' ? next.resolvedColorScheme : patch.value.colorScheme
      }
    } else if (patch.section === 'layout') {
      next = { ...next, layout: patch.value }
    } else {
      next = { ...next, locale: patch.value }
    }
  }
  return { ...state, snapshot: next }
}

function setConfirmedState(state: ClientSettingsState): void {
  setState(applyPendingPatches(state))
}

function setMutationError(error: unknown): void {
  const normalized =
    error instanceof ClientSettingsError
      ? error.toDto()
      : {
          code: 'CLIENT_SETTINGS_IO' as const,
          message: error instanceof Error ? error.message : '设置保存失败'
        }
  emit({ ...snapshot, mutationError: normalized })
}

function initialize(): void {
  if (initialized) return
  initialized = true
  if (!snapshot.state) setState(clientSettings().bootstrap({}).state)
  void clientSettings()
    .get()
    .then(setConfirmedState, (error) => {
      setMutationError(error)
    })
  clientSettings().subscribe(setConfirmedState)
}

export function seedAppearanceStore(state: ClientSettingsState): void {
  if (initialized || snapshot.state) return
  snapshot = { state, mutationError: null }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearanceStore(): AppearanceStoreSnapshot {
  initialize()
  return useSyncExternalStore(subscribe, () => snapshot)
}

export function getAppearanceStoreSnapshot(): AppearanceStoreSnapshot {
  initialize()
  return snapshot
}

async function patchClientSettings(patch: ClientSettingsPatch): Promise<void> {
  const revision = ++nextMutationRevision
  pendingPatches.set(patch.section, { revision, patch })
  const current = snapshot.state
  if (current?.status === 'ready') {
    setState(applyPendingPatches(current))
  }
  const operation = mutationTail.then(async () => {
    try {
      const updated = await clientSettings().patch(patch)
      if (pendingPatches.get(patch.section)?.revision === revision) {
        pendingPatches.delete(patch.section)
      }
      setConfirmedState({ status: 'ready', snapshot: updated })
    } catch (error) {
      if (pendingPatches.get(patch.section)?.revision === revision) {
        pendingPatches.delete(patch.section)
      }
      setMutationError(error)
      try {
        const confirmed = applyPendingPatches(await clientSettings().get())
        emit({ state: confirmed, mutationError: snapshot.mutationError })
      } catch (refreshError) {
        setMutationError(refreshError)
      }
    }
  })
  mutationTail = operation.then(
    () => undefined,
    () => undefined
  )
  await operation
}

export async function updateAppearance(value: AppearanceSettings): Promise<void> {
  await patchClientSettings({ section: 'appearance', value })
}

export async function updateLayout(value: ClientLayout): Promise<void> {
  await patchClientSettings({ section: 'layout', value })
}

export async function updateLayoutWidth(key: ClientLayoutKey, value: number): Promise<void> {
  const current = snapshot.state
  if (current?.status !== 'ready') return
  await updateLayout({ ...current.snapshot.layout, [key]: value })
}

export async function chooseBackground(): Promise<void> {
  try {
    const updated = await clientSettings().chooseBackground()
    setState({ status: 'ready', snapshot: updated })
  } catch (error) {
    setMutationError(error)
  }
}

export async function clearBackground(): Promise<void> {
  try {
    const updated = await clientSettings().clearBackground()
    setState({ status: 'ready', snapshot: updated })
  } catch (error) {
    setMutationError(error)
  }
}

export async function resetClientSettings(): Promise<void> {
  try {
    const updated = await clientSettings().reset()
    setState({ status: 'ready', snapshot: updated })
  } catch (error) {
    setMutationError(error)
  }
}

export function dismissAppearanceMutationError(): void {
  emit({ ...snapshot, mutationError: null })
}
