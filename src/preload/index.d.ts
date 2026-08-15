import type { KoWorkApi } from '@kowork/contracts'

declare global {
  interface Window {
    kowork: KoWorkApi
  }
}

export {}
