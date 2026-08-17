import { describe, expect, it } from 'vitest'
import { parseRpcInput, resolveSystemBackdrop, rpcRequestEnvelopeSchema } from '@kowork/contracts'

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
        kind: 'custom',
        protocol: 'anthropic',
        baseUrl: 'http://127.0.0.1:8000',
        credentialId: 'provider-1',
        defaultContextWindowTokens: 200_000
      })
    ).toEqual({
      id: 'provider-1',
      name: 'DeepSeek',
      kind: 'custom',
      protocol: 'anthropic',
      baseUrl: 'http://127.0.0.1:8000',
      credentialId: 'provider-1',
      defaultContextWindowTokens: 200_000
    })
  })

  it('validates typed application settings', () => {
    expect(
      parseRpcInput('settings.update', {
        defaultModelProfileId: 'openai-gpt-4.1-mini',
        defaultPermissionMode: 'auto'
      })
    ).toEqual({ defaultModelProfileId: 'openai-gpt-4.1-mini', defaultPermissionMode: 'auto' })
    expect(() =>
      parseRpcInput('settings.update', { defaultPermissionMode: 'unrestricted' })
    ).toThrow()
  })
})

describe('system backdrop', () => {
  it('uses macOS vibrancy and Windows 11 mica, otherwise none', () => {
    expect(resolveSystemBackdrop('darwin', '15.6.0')).toBe('vibrancy')
    expect(resolveSystemBackdrop('win32', '10.0.22621')).toBe('mica')
    expect(resolveSystemBackdrop('win32', '10.0.26100')).toBe('mica')
    expect(resolveSystemBackdrop('win32', '10.0.19045')).toBe('none')
    expect(resolveSystemBackdrop('linux', '6.8.0')).toBe('none')
  })
})
