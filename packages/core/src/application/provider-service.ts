import { z } from 'zod'
import type {
  ModelProfileDto,
  ModelRefreshResultDto,
  ProviderDto,
  ProviderKind,
  ProviderProtocol
} from '@kowork/contracts'
import { CoreError } from '../domain/errors'
import type { CredentialProvider } from '../infrastructure/credentials/credential-provider'
import type { AppDatabase } from '../infrastructure/db/database'

const protocolsByKind: Record<ProviderKind, readonly ProviderProtocol[]> = {
  openai: ['openai-chat', 'openai-responses'],
  anthropic: ['anthropic'],
  deepseek: ['openai-chat', 'openai-responses', 'anthropic'],
  qwen: ['qwen'],
  ollama: ['ollama'],
  custom: ['openai-chat', 'openai-responses', 'anthropic']
}

const listedModelsSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1) }))
})

const ollamaModelsSchema = z.object({
  models: z.array(
    z.object({
      name: z.string().optional(),
      model: z.string().optional()
    })
  )
})

function assertConfiguration(
  kind: ProviderKind,
  protocol: ProviderProtocol,
  baseUrl: string
): void {
  if (!protocolsByKind[kind].includes(protocol)) {
    throw new CoreError(
      'invalid_provider_protocol',
      `Protocol '${protocol}' is not supported by provider kind '${kind}'`
    )
  }
  const url = new URL(baseUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CoreError('invalid_provider_url', 'Provider Base URL must use HTTP or HTTPS')
  }
}

function stripKnownEndpoint(pathname: string): string {
  return pathname
    .replace(/\/(?:chat\/completions|responses|messages)\/?$/u, '')
    .replace(/\/+$/u, '')
}

function modelListUrl(provider: ProviderDto): string {
  const url = new URL(provider.baseUrl)
  const path = stripKnownEndpoint(url.pathname)
  if (provider.protocol === 'ollama') {
    url.pathname = `${path}/api/tags`.replace(/\/{2,}/gu, '/')
    return url.toString()
  }
  if (provider.protocol === 'anthropic') {
    url.pathname = `${path.endsWith('/v1') ? path : `${path}/v1`}/models`.replace(/\/{2,}/gu, '/')
    return url.toString()
  }
  if (provider.kind === 'deepseek' && path === '') {
    url.pathname = '/models'
    return url.toString()
  }
  url.pathname = `${path.endsWith('/v1') ? path : `${path}/v1`}/models`.replace(/\/{2,}/gu, '/')
  return url.toString()
}

export class ProviderService {
  constructor(
    private readonly database: AppDatabase,
    private readonly credentials: CredentialProvider
  ) {}

  list(): ProviderDto[] {
    return this.database.listProviders()
  }

  create(input: {
    id: string
    name: string
    kind: ProviderKind
    protocol: ProviderProtocol
    baseUrl: string
    credentialId: string | null
    defaultContextWindowTokens: number
  }): ProviderDto {
    assertConfiguration(input.kind, input.protocol, input.baseUrl)
    return this.database.createProvider(input)
  }

  update(
    providerId: string,
    changes: Partial<{
      name: string
      kind: ProviderKind
      protocol: ProviderProtocol
      baseUrl: string
      credentialId: string | null
      defaultContextWindowTokens: number
      enabled: boolean
    }>
  ): ProviderDto {
    const current = this.database.getProvider(providerId)
    assertConfiguration(
      changes.kind ?? current.kind,
      changes.protocol ?? current.protocol,
      changes.baseUrl ?? current.baseUrl
    )
    return this.database.updateProvider(providerId, changes)
  }

  archive(providerId: string): ProviderDto {
    return this.database.archiveProvider(providerId)
  }

  async refreshModels(providerId: string): Promise<ModelRefreshResultDto> {
    const provider = this.database.getProvider(providerId)
    const apiKey = provider.kind === 'ollama' ? undefined : await this.credentials.get(provider.id)
    if (provider.kind !== 'ollama' && !apiKey) {
      throw new CoreError('api_key_missing', `Provider '${provider.name}' has no API key`)
    }
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (provider.protocol === 'anthropic') {
      headers['x-api-key'] = apiKey!
      headers['anthropic-version'] = '2023-06-01'
    } else if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    let response: Response
    try {
      response = await fetch(modelListUrl(provider), {
        headers,
        signal: AbortSignal.timeout(15_000)
      })
    } catch (error) {
      throw new CoreError(
        'model_refresh_failed',
        error instanceof Error ? error.message : 'Could not connect to the provider'
      )
    }
    if (!response.ok) {
      throw new CoreError(
        'model_refresh_failed',
        `Provider returned HTTP ${response.status} while listing models`
      )
    }
    const body: unknown = await response.json()
    const models =
      provider.protocol === 'ollama'
        ? ollamaModelsSchema
            .parse(body)
            .models.map((item) => item.name ?? item.model)
            .filter((value): value is string => Boolean(value))
        : listedModelsSchema.parse(body).data.map((item) => item.id)
    const uniqueModels = [...new Set(models.map((model) => model.trim()).filter(Boolean))].slice(
      0,
      5_000
    )
    if (uniqueModels.length === 0) {
      throw new CoreError('model_refresh_failed', 'Provider returned an empty model list')
    }
    return {
      providerId,
      discovered: uniqueModels.length,
      models: this.database.upsertRemoteModels(providerId, uniqueModels)
    }
  }

  addModel(input: {
    providerId: string
    model: string
    name?: string
    contextWindowTokens: number
  }): ModelProfileDto {
    return this.database.addModel({
      ...input,
      name: input.name?.trim() || input.model
    })
  }

  archiveModel(modelProfileId: string): ModelProfileDto {
    return this.database.archiveModel(modelProfileId)
  }
}
