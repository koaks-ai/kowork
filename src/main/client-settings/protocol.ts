import { protocol } from 'electron'
import { ClientSettingsError } from '@kowork/client-settings'
import type { BackgroundAssetStore } from './backgrounds'

export function registerBackgroundProtocol(
  assets: BackgroundAssetStore,
  currentAssetId: () => string | null,
  clearInvalidBackground: (assetId: string) => Promise<void>
): () => void {
  protocol.handle('kowork-bg', async (request) => {
    let requestedAssetId: string | null = null
    try {
      const url = new URL(request.url)
      const assetId = decodeURIComponent(url.hostname)
      if (!assetId || !['', '/'].includes(url.pathname) || assetId !== currentAssetId()) {
        return new Response('Background not found', { status: 404 })
      }
      requestedAssetId = assetId
      const asset = await assets.validate(assetId)
      const body = new Uint8Array(asset.body.byteLength)
      body.set(asset.body)
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': asset.mimeType,
          'Cache-Control': 'private, max-age=31536000, immutable'
        }
      })
    } catch (error) {
      if (requestedAssetId && error instanceof ClientSettingsError) {
        try {
          await clearInvalidBackground(requestedAssetId)
        } catch (clearError) {
          console.error('Failed to clear an invalid background setting', clearError)
          return new Response('Background load failed', { status: 500 })
        }
      }
      const status = error instanceof ClientSettingsError ? 404 : 500
      return new Response(status === 404 ? 'Background not found' : 'Background load failed', {
        status
      })
    }
  })
  return () => {
    void protocol.unhandle('kowork-bg')
  }
}
