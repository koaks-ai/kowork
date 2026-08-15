import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProviderService } from '../../packages/core/src/application/provider-service'
import { AppDatabase } from '../../packages/core/src/infrastructure/db/database'

const closeCallbacks: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()))
})

describe('Provider service', () => {
  it('supports the requested DeepSeek protocols and rejects invalid built-in combinations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-provider-policy-'))
    const database = new AppDatabase(join(root, 'kowork.sqlite'))
    closeCallbacks.push(async () => database.close())
    const service = new ProviderService(database, { get: async () => 'secret' })
    expect(
      service.create({
        id: 'deepseek-anthropic',
        name: 'DeepSeek Anthropic',
        kind: 'deepseek',
        protocol: 'anthropic',
        baseUrl: 'https://api.deepseek.com',
        credentialId: 'deepseek-anthropic',
        defaultContextWindowTokens: 128_000
      }).protocol
    ).toBe('anthropic')
    expect(() =>
      service.create({
        id: 'invalid-openai',
        name: 'Invalid OpenAI',
        kind: 'openai',
        protocol: 'anthropic',
        baseUrl: 'https://api.openai.com',
        credentialId: 'invalid-openai',
        defaultContextWindowTokens: 128_000
      })
    ).toThrow(/not supported/)
  })

  it('refreshes Anthropic-compatible models with the stored credential', async () => {
    let requestPath = ''
    let apiKey = ''
    const server = createServer((request, response) => {
      requestPath = request.url ?? ''
      apiKey = String(request.headers['x-api-key'] ?? '')
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    closeCallbacks.push(
      async () =>
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
    )
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not bind')

    const root = await mkdtemp(join(tmpdir(), 'kowork-provider-refresh-'))
    const database = new AppDatabase(join(root, 'kowork.sqlite'))
    closeCallbacks.push(async () => database.close())
    const service = new ProviderService(database, { get: async () => 'stored-key' })
    service.create({
      id: 'custom-anthropic',
      name: 'Custom Anthropic',
      kind: 'custom',
      protocol: 'anthropic',
      baseUrl: `http://127.0.0.1:${address.port}`,
      credentialId: 'custom-anthropic',
      defaultContextWindowTokens: 200_000
    })

    const refreshed = await service.refreshModels('custom-anthropic')
    expect(requestPath).toBe('/v1/models')
    expect(apiKey).toBe('stored-key')
    expect(refreshed.discovered).toBe(2)
    expect(refreshed.models.map((model) => model.model)).toEqual(['model-a', 'model-b'])
    expect(refreshed.models.every((model) => model.available)).toBe(true)
  })
})
