import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BackgroundAssetStore,
  backgroundTestSupport
} from '../../src/main/client-settings/backgrounds'

function png(width = 1, height = 1): Buffer {
  const buffer = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

describe('background asset validation', () => {
  it('detects PNG dimensions and rejects mismatched extensions', () => {
    const buffer = png(1920, 1080)
    expect(backgroundTestSupport.validateImage(buffer, '.png')).toMatchObject({
      extension: 'png',
      width: 1920,
      height: 1080,
      mimeType: 'image/png'
    })
    expect(() => backgroundTestSupport.validateImage(buffer, '.gif')).toThrow(
      '背景图片扩展名与实际格式不一致'
    )
  })

  it('rejects oversized dimensions and unknown formats', () => {
    const oversized = png(20_000, 100)
    expect(() => backgroundTestSupport.validateImage(oversized, '.png')).toThrow('背景图片尺寸过大')
    expect(() => backgroundTestSupport.validateImage(Buffer.from('not an image'))).toThrow(
      '背景图片必须是有效的 PNG、JPEG、WebP 或 GIF 文件'
    )
    expect(() => backgroundTestSupport.validateImage(Buffer.alloc(15 * 1024 * 1024 + 1))).toThrow(
      '背景图片不能超过 15 MB'
    )
  })

  it('rejects traversal and removes only unreferenced registered assets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kowork-background-assets-'))
    const assets = new BackgroundAssetStore(directory)
    const current = '31ce027a-f782-4da5-b914-49a20a8b84c2.png'
    const stale = '67a0ef4a-991c-4ddb-9fc2-3f36f6de05d4.jpeg'
    await writeFile(join(directory, current), png())
    await writeFile(join(directory, stale), png())
    await writeFile(join(directory, 'keep.txt'), 'not managed')

    expect(() => assets.pathFor('../outside.png')).toThrow('背景资源路径无效')
    await assets.garbageCollect(current)

    await expect(readFile(join(directory, current))).resolves.toEqual(png())
    await expect(readFile(join(directory, stale))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, 'keep.txt'), 'utf8')).resolves.toBe('not managed')
  })

  it('rejects symlinks even when their names look like registered assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-background-symlink-'))
    const directory = join(root, 'backgrounds')
    const assets = new BackgroundAssetStore(directory)
    const assetId = '31ce027a-f782-4da5-b914-49a20a8b84c2.png'
    await mkdir(directory)
    await writeFile(join(root, 'outside.png'), png())
    await symlink(join(root, 'outside.png'), join(directory, assetId))

    await expect(assets.validate(assetId)).rejects.toMatchObject({
      code: 'BACKGROUND_INVALID',
      message: '背景资源文件无效'
    })
  })
})
