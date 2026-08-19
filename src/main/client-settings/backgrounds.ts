import { lstat, mkdir, readFile, readdir, realpath, unlink, writeFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { dialog } from 'electron'
import { ClientSettingsError, backgroundAssetIdSchema } from '@kowork/client-settings'

const MAX_BACKGROUND_BYTES = 15 * 1024 * 1024
const MAX_BACKGROUND_PIXELS = 64_000_000
const MAX_BACKGROUND_SIDE = 16_384

type BackgroundExtension = 'png' | 'jpeg' | 'webp' | 'gif'

interface DetectedImage {
  extension: BackgroundExtension
  width: number
  height: number
  mimeType: string
}

function uint24Le(buffer: Buffer, offset: number): number {
  return buffer[offset]! | (buffer[offset + 1]! << 8) | (buffer[offset + 2]! << 16)
}

function detectJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]!
    offset += 2
    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 2 > buffer.length) return null
    const length = buffer.readUInt16BE(offset)
    if (length < 2 || offset + length > buffer.length) return null
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (length < 7) return null
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) }
    }
    offset += length
  }
  return null
}

function detectImage(buffer: Buffer): DetectedImage | null {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return {
      extension: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      mimeType: 'image/png'
    }
  }
  if (buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) {
    return {
      extension: 'gif',
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
      mimeType: 'image/gif'
    }
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const dimensions = detectJpegDimensions(buffer)
    return dimensions ? { extension: 'jpeg', ...dimensions, mimeType: 'image/jpeg' } : null
  }
  if (
    buffer.length >= 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunk = buffer.toString('ascii', 12, 16)
    if (chunk === 'VP8X') {
      return {
        extension: 'webp',
        width: uint24Le(buffer, 24) + 1,
        height: uint24Le(buffer, 27) + 1,
        mimeType: 'image/webp'
      }
    }
    if (chunk === 'VP8L' && buffer[20] === 0x2f) {
      const width = 1 + buffer[21]! + ((buffer[22]! & 0x3f) << 8)
      const height = 1 + (buffer[22]! >> 6) + (buffer[23]! << 2) + ((buffer[24]! & 0x0f) << 10)
      return { extension: 'webp', width, height, mimeType: 'image/webp' }
    }
    if (chunk === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return {
        extension: 'webp',
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
        mimeType: 'image/webp'
      }
    }
  }
  return null
}

function validateImage(buffer: Buffer, sourceExtension?: string): DetectedImage {
  if (buffer.byteLength > MAX_BACKGROUND_BYTES) {
    throw new ClientSettingsError({
      code: 'BACKGROUND_INVALID',
      message: '背景图片不能超过 15 MB'
    })
  }
  const detected = detectImage(buffer)
  if (!detected) {
    throw new ClientSettingsError({
      code: 'BACKGROUND_INVALID',
      message: '背景图片必须是有效的 PNG、JPEG、WebP 或 GIF 文件'
    })
  }
  if (sourceExtension) {
    const normalized = sourceExtension.toLowerCase().replace(/^\./u, '')
    const matches =
      normalized === detected.extension || (detected.extension === 'jpeg' && normalized === 'jpg')
    if (!matches) {
      throw new ClientSettingsError({
        code: 'BACKGROUND_INVALID',
        message: '背景图片扩展名与实际格式不一致'
      })
    }
  }
  if (
    detected.width <= 0 ||
    detected.height <= 0 ||
    detected.width > MAX_BACKGROUND_SIDE ||
    detected.height > MAX_BACKGROUND_SIDE ||
    detected.width * detected.height > MAX_BACKGROUND_PIXELS
  ) {
    throw new ClientSettingsError({
      code: 'BACKGROUND_INVALID',
      message: '背景图片尺寸过大'
    })
  }
  return detected
}

export class BackgroundAssetStore {
  constructor(readonly directory: string) {}

  async chooseAndImport(): Promise<string | null> {
    const testSource =
      process.env.KOWORK_FAKE_AGENT === '1' ? process.env.KOWORK_E2E_BACKGROUND_PATH : undefined
    let result: { canceled: boolean; filePaths: string[] }
    try {
      result = testSource
        ? { canceled: false, filePaths: [testSource] }
        : await dialog.showOpenDialog({
            title: '选择背景图片',
            properties: ['openFile'],
            filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
          })
    } catch (error) {
      throw new ClientSettingsError(
        { code: 'CLIENT_SETTINGS_IO', message: '打开背景图片选择器失败' },
        { cause: error }
      )
    }
    const sourcePath = result.filePaths[0]
    if (result.canceled || !sourcePath) return null
    let source: Buffer
    try {
      source = await readFile(sourcePath)
    } catch (error) {
      throw new ClientSettingsError(
        { code: 'BACKGROUND_INVALID', message: '无法读取所选背景图片' },
        { cause: error }
      )
    }
    const detected = validateImage(source, extname(sourcePath))
    const assetId = `${crypto.randomUUID()}.${detected.extension}`
    const destination = this.pathFor(assetId)
    try {
      await mkdir(this.directory, { recursive: true })
      await writeFile(destination, source, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      throw new ClientSettingsError(
        { code: 'CLIENT_SETTINGS_IO', message: '保存背景图片失败' },
        { cause: error }
      )
    }
    return assetId
  }

  async validate(assetId: string): Promise<{ path: string; mimeType: string; body: Buffer }> {
    const parsed = backgroundAssetIdSchema.safeParse(assetId)
    if (!parsed.success) {
      throw new ClientSettingsError({ code: 'BACKGROUND_INVALID', message: '背景资源 ID 无效' })
    }
    const directory = await realpath(this.directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        throw new ClientSettingsError({ code: 'BACKGROUND_INVALID', message: '背景资源不存在' })
      }
      throw error
    })
    const path = this.pathFor(parsed.data)
    const entryStats = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        throw new ClientSettingsError({ code: 'BACKGROUND_INVALID', message: '背景资源不存在' })
      }
      throw error
    })
    if (!entryStats.isFile() || entryStats.size > MAX_BACKGROUND_BYTES) {
      throw new ClientSettingsError({ code: 'BACKGROUND_INVALID', message: '背景资源文件无效' })
    }
    const canonical = await realpath(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        throw new ClientSettingsError({ code: 'BACKGROUND_INVALID', message: '背景资源不存在' })
      }
      throw error
    })
    if (!canonical.startsWith(`${directory}${sep}`)) {
      throw new ClientSettingsError({ code: 'BACKGROUND_INVALID', message: '背景资源路径无效' })
    }
    const buffer = await readFile(canonical)
    const detected = validateImage(buffer, extname(canonical))
    return { path: canonical, mimeType: detected.mimeType, body: buffer }
  }

  async remove(assetId: string): Promise<void> {
    backgroundAssetIdSchema.parse(assetId)
    try {
      await unlink(this.pathFor(assetId))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  async garbageCollect(currentAssetId: string | null): Promise<void> {
    let entries
    try {
      entries = await readdir(this.directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    const results = await Promise.allSettled(
      entries
        .filter(
          (entry) =>
            (entry.isFile() || entry.isSymbolicLink()) &&
            entry.name !== currentAssetId &&
            backgroundAssetIdSchema.safeParse(entry.name).success
        )
        .map((entry) => unlink(this.pathFor(entry.name)))
    )
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason)
    if (failures.length > 0) {
      throw new AggregateError(failures, '清理未引用的背景文件失败')
    }
  }

  pathFor(assetId: string): string {
    const path = resolve(this.directory, assetId)
    const root = resolve(this.directory)
    if (!path.startsWith(`${root}${sep}`)) {
      throw new ClientSettingsError({ code: 'BACKGROUND_INVALID', message: '背景资源路径无效' })
    }
    return path
  }
}

export const backgroundTestSupport = { detectImage, validateImage }
