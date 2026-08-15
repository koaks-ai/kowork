import { describe, expect, it } from 'vitest'
import { parseRpcInput, rpcRequestEnvelopeSchema } from '@kowork/contracts'

describe('RPC contracts', () => {
  it('validates method payloads at the process boundary', () => {
    expect(
      parseRpcInput('runs.enqueue', { threadId: 'thread-1', input: 'Inspect the project' })
    ).toEqual({
      threadId: 'thread-1',
      input: 'Inspect the project'
    })
    expect(() => parseRpcInput('runs.enqueue', { threadId: 'thread-1', input: '   ' })).toThrow()
  })

  it('rejects unsupported protocol versions', () => {
    expect(() =>
      rpcRequestEnvelopeSchema.parse({ version: 99, id: '1', method: 'app.bootstrap', payload: {} })
    ).toThrow()
  })

  it('validates provider configuration without exposing stored credentials', () => {
    expect(
      parseRpcInput('providers.create', {
        id: 'provider-1',
        name: 'DeepSeek',
        kind: 'deepseek',
        protocol: 'anthropic',
        baseUrl: 'https://api.deepseek.com',
        credentialId: 'provider-1',
        defaultContextWindowTokens: 128_000
      })
    ).toEqual({
      id: 'provider-1',
      name: 'DeepSeek',
      kind: 'deepseek',
      protocol: 'anthropic',
      baseUrl: 'https://api.deepseek.com',
      credentialId: 'provider-1',
      defaultContextWindowTokens: 128_000
    })
  })

  it('validates typed application settings', () => {
    expect(
      parseRpcInput('settings.update', {
        defaultModelProfileId: 'ollama-qwen3',
        defaultPermissionMode: 'auto'
      })
    ).toEqual({ defaultModelProfileId: 'ollama-qwen3', defaultPermissionMode: 'auto' })
    expect(() =>
      parseRpcInput('settings.update', { defaultPermissionMode: 'unrestricted' })
    ).toThrow()
  })
})
