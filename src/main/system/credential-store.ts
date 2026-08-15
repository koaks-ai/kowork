import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { safeStorage } from 'electron'
import { z } from 'zod'

const credentialFileSchema = z.object({
  version: z.literal(1),
  credentials: z.record(z.string(), z.string())
})

type CredentialFile = z.infer<typeof credentialFileSchema>

export class CredentialStore {
  private dataPromise?: Promise<CredentialFile>
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {}

  private async load(): Promise<CredentialFile> {
    if (!this.dataPromise) {
      this.dataPromise = readFile(this.path, 'utf8')
        .then((content) => credentialFileSchema.parse(JSON.parse(content) as unknown))
        .catch((error: unknown) => {
          const code = error instanceof Error ? Reflect.get(error, 'code') : undefined
          if (code === 'ENOENT') return { version: 1, credentials: {} }
          throw error
        })
    }
    return await this.dataPromise
  }

  private ensureEncryption(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is not available on this system')
    }
  }

  private async persist(data: CredentialFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.${process.pid}.${crypto.randomUUID()}.tmp`
    await writeFile(temporaryPath, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, this.path)
  }

  private async mutate(block: (data: CredentialFile) => void): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const data = await this.load()
        block(data)
        await this.persist(data)
      })
    return await this.writeQueue
  }

  async get(providerId: string): Promise<string | undefined> {
    await this.writeQueue
    const encrypted = (await this.load()).credentials[providerId]
    if (!encrypted) return undefined
    this.ensureEncryption()
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }

  async has(providerId: string): Promise<boolean> {
    try {
      return Boolean(await this.get(providerId))
    } catch {
      return false
    }
  }

  async set(providerId: string, apiKey: string): Promise<void> {
    this.ensureEncryption()
    const encrypted = safeStorage.encryptString(apiKey).toString('base64')
    await this.mutate((data) => {
      data.credentials[providerId] = encrypted
    })
  }

  async remove(providerId: string): Promise<void> {
    await this.mutate((data) => {
      delete data.credentials[providerId]
    })
  }
}
