import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { promisify } from 'node:util'
import { dirname, relative, resolve, sep } from 'node:path'
import { minimatch } from 'minimatch'
import type { FileContentDto, FileEntryDto, ProjectDto } from '@kowork/contracts'
import { CoreError } from '../../domain/errors'
import { isWithinPath, resolveProjectPath } from './path-policy'

const exec = promisify(execFile)
const ignoredNames = new Set(['.git', 'node_modules', '.DS_Store', 'out', 'dist'])
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_SCANNED_FILES = 10_000

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new CoreError(
      'tool_cancelled',
      typeof signal.reason === 'string' ? signal.reason : 'Tool call was cancelled'
    )
  }
}

function portablePath(path: string): string {
  return path.split(sep).join('/')
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1
}

function displayPath(projectRoot: string, path: string): string {
  return isWithinPath(projectRoot, path) ? portablePath(relative(projectRoot, path)) : path
}

async function readTextBuffer(path: string, signal: AbortSignal): Promise<Buffer> {
  assertActive(signal)
  const info = await stat(path)
  if (!info.isFile()) throw new CoreError('not_a_file', `'${path}' is not a file`)
  if (info.size > MAX_FILE_BYTES) {
    throw new CoreError('file_too_large', `'${path}' is larger than 2 MiB`)
  }
  const buffer = await readFile(path, { signal })
  if (buffer.includes(0)) throw new CoreError('binary_file', `'${path}' is a binary file`)
  return buffer
}

async function atomicWrite(path: string, content: string, signal: AbortSignal): Promise<void> {
  assertActive(signal)
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  let mode: number | undefined
  try {
    mode = (await stat(path)).mode & 0o7777
  } catch {
    mode = undefined
  }
  const temporary = resolve(directory, `.kowork-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, {
      encoding: 'utf8',
      signal,
      ...(mode !== undefined ? { mode } : {})
    })
    if (mode !== undefined) await chmod(temporary, mode)
    assertActive(signal)
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

interface FileScan {
  files: string[]
  scannedFiles: number
  scanTruncated: boolean
}

export class FileService {
  async list(project: ProjectDto, relativePath = '.'): Promise<FileEntryDto[]> {
    const directory = await resolveProjectPath(project.rootPath, relativePath)
    if (!isWithinPath(project.rootPath, directory)) {
      throw new CoreError('path_outside_project', `'${relativePath}' is outside the project`)
    }
    const entries = await readdir(directory, { withFileTypes: true })
    const result: FileEntryDto[] = []
    for (const entry of entries) {
      if (ignoredNames.has(entry.name) || entry.isSymbolicLink()) continue
      const fullPath = await resolveProjectPath(directory, entry.name)
      const info = await stat(fullPath)
      result.push({
        name: entry.name,
        relativePath: relative(project.rootPath, fullPath),
        kind: entry.isDirectory() ? 'directory' : 'file',
        size: info.size,
        modifiedAt: info.mtimeMs
      })
    }
    return result.sort((a, b) =>
      a.kind === b.kind ? compareText(a.name, b.name) : a.kind === 'directory' ? -1 : 1
    )
  }

  async read(project: ProjectDto, relativePath: string): Promise<FileContentDto> {
    const path = await resolveProjectPath(project.rootPath, relativePath)
    if (!isWithinPath(project.rootPath, path)) {
      throw new CoreError('path_outside_project', `'${relativePath}' is outside the project`)
    }
    const info = await stat(path)
    const buffer = await readTextBuffer(path, new AbortController().signal)
    return {
      relativePath,
      content: buffer.toString('utf8'),
      size: info.size,
      modifiedAt: info.mtimeMs
    }
  }

  async listForTool(input: {
    projectRoot: string
    path: string
    offset: number
    limit: number
    signal: AbortSignal
  }): Promise<Record<string, unknown>> {
    assertActive(input.signal)
    const entries = (await readdir(input.path, { withFileTypes: true }))
      .filter((entry) => !ignoredNames.has(entry.name) && !entry.isSymbolicLink())
      .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }))
      .sort((left, right) =>
        left.kind === right.kind
          ? compareText(left.name, right.name)
          : left.kind === 'directory'
            ? -1
            : 1
      )
    const selected = entries.slice(input.offset, input.offset + input.limit)
    return {
      path: displayPath(input.projectRoot, input.path),
      entries: selected,
      total: entries.length,
      offset: input.offset,
      nextOffset:
        input.offset + selected.length < entries.length ? input.offset + selected.length : null
    }
  }

  async readForTool(input: {
    projectRoot: string
    path: string
    offset: number
    limit: number
    signal: AbortSignal
  }): Promise<Record<string, unknown>> {
    const content = (await readTextBuffer(input.path, input.signal)).toString('utf8')
    const lines = content.split(/\r?\n/u)
    if (lines.at(-1) === '' && content.endsWith('\n')) lines.pop()
    const startIndex = Math.min(input.offset - 1, lines.length)
    const selected = lines.slice(startIndex, startIndex + input.limit)
    return {
      path: displayPath(input.projectRoot, input.path),
      content: selected.map((line, index) => `${startIndex + index + 1}\t${line}`).join('\n'),
      startLine: selected.length > 0 ? startIndex + 1 : null,
      endLine: selected.length > 0 ? startIndex + selected.length : null,
      totalLines: lines.length,
      truncated: startIndex + selected.length < lines.length
    }
  }

  async globForTool(input: {
    projectRoot: string
    path: string
    pattern: string
    limit: number
    signal: AbortSignal
  }): Promise<Record<string, unknown>> {
    const scan = await this.scanFiles(input.projectRoot, input.path, input.signal)
    const matches = scan.files
      .map((path) => ({ absolute: path, relative: portablePath(relative(input.path, path)) }))
      .filter(({ relative: path }) => minimatch(path, input.pattern, { dot: true }))
      .map(({ absolute }) => displayPath(input.projectRoot, absolute))
      .sort(compareText)
    return {
      matches: matches.slice(0, input.limit),
      totalMatches: matches.length,
      scannedFiles: scan.scannedFiles,
      truncated: matches.length > input.limit || scan.scanTruncated
    }
  }

  async searchForTool(input: {
    projectRoot: string
    path: string
    pattern: string
    glob?: string
    caseSensitive: boolean
    context: number
    limit: number
    signal: AbortSignal
  }): Promise<Record<string, unknown>> {
    let expression: RegExp
    try {
      expression = new RegExp(input.pattern, input.caseSensitive ? 'u' : 'iu')
    } catch (error) {
      throw new CoreError(
        'invalid_tool_input',
        `Invalid search pattern: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const scan = await this.scanFiles(input.projectRoot, input.path, input.signal)
    const matches: Array<Record<string, unknown>> = []
    for (const file of scan.files) {
      assertActive(input.signal)
      const relativePath = portablePath(relative(input.path, file))
      if (input.glob && !minimatch(relativePath, input.glob, { dot: true })) continue
      try {
        const buffer = await readTextBuffer(file, input.signal)
        const lines = buffer.toString('utf8').split(/\r?\n/u)
        for (let index = 0; index < lines.length && matches.length < input.limit; index += 1) {
          if (!expression.test(lines[index]!)) continue
          matches.push({
            path: displayPath(input.projectRoot, file),
            line: index + 1,
            text: lines[index],
            before: lines.slice(Math.max(0, index - input.context), index),
            after: lines.slice(index + 1, index + 1 + input.context)
          })
        }
      } catch (error) {
        if (error instanceof CoreError && error.code === 'tool_cancelled') throw error
        // Binary, oversized and unreadable files are intentionally skipped.
      }
      if (matches.length >= input.limit) break
    }
    return {
      matches,
      scannedFiles: scan.scannedFiles,
      truncated: matches.length >= input.limit || scan.scanTruncated
    }
  }

  async editForTool(input: {
    projectRoot: string
    path: string
    oldText: string
    newText: string
    replaceAll: boolean
    signal: AbortSignal
  }): Promise<Record<string, unknown>> {
    const source = (await readTextBuffer(input.path, input.signal)).toString('utf8')
    let count = 0
    let position = 0
    while ((position = source.indexOf(input.oldText, position)) !== -1) {
      count += 1
      position += input.oldText.length
    }
    if (count === 0) {
      throw new CoreError('match_not_found', `The requested text was not found in '${input.path}'`)
    }
    if (!input.replaceAll && count !== 1) {
      throw new CoreError(
        'ambiguous_match',
        `The requested text occurs ${count} times in '${input.path}'`
      )
    }
    const updated = input.replaceAll
      ? source.split(input.oldText).join(input.newText)
      : source.replace(input.oldText, input.newText)
    await atomicWrite(input.path, updated, input.signal)
    return {
      path: displayPath(input.projectRoot, input.path),
      replacements: input.replaceAll ? count : 1
    }
  }

  async writeForTool(input: {
    projectRoot: string
    path: string
    content: string
    signal: AbortSignal
  }): Promise<Record<string, unknown>> {
    await atomicWrite(input.path, input.content, input.signal)
    return {
      path: displayPath(input.projectRoot, input.path),
      bytesWritten: Buffer.byteLength(input.content, 'utf8')
    }
  }

  private async scanFiles(
    projectRoot: string,
    root: string,
    signal: AbortSignal
  ): Promise<FileScan> {
    if (isWithinPath(projectRoot, root)) {
      const gitFiles = await this.gitFiles(projectRoot, root, signal)
      if (gitFiles) return gitFiles
    }
    const files: string[] = []
    const walk = async (directory: string): Promise<void> => {
      assertActive(signal)
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (files.length >= MAX_SCANNED_FILES) return
        if (ignoredNames.has(entry.name) || entry.isSymbolicLink()) continue
        const path = resolve(directory, entry.name)
        const info = await lstat(path)
        if (info.isSymbolicLink()) continue
        if (info.isDirectory()) await walk(path)
        else if (info.isFile()) files.push(path)
      }
    }
    await walk(root)
    return {
      files,
      scannedFiles: files.length,
      scanTruncated: files.length >= MAX_SCANNED_FILES
    }
  }

  private async gitFiles(
    projectRoot: string,
    root: string,
    signal: AbortSignal
  ): Promise<FileScan | undefined> {
    try {
      const relativeRoot = portablePath(relative(projectRoot, root))
      const args = [
        '-C',
        projectRoot,
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z'
      ]
      if (relativeRoot) args.push('--', `${relativeRoot}/`)
      const { stdout } = await exec('git', args, {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        signal
      })
      const files: string[] = []
      const candidates = stdout.split('\0').filter(Boolean)
      for (const candidate of candidates) {
        if (files.length >= MAX_SCANNED_FILES) break
        const path = resolve(projectRoot, candidate)
        if (!isWithinPath(root, path)) continue
        const info = await lstat(path).catch(() => undefined)
        if (info?.isFile() && !info.isSymbolicLink()) files.push(path)
      }
      return {
        files,
        scannedFiles: files.length,
        scanTruncated: candidates.length > files.length && files.length >= MAX_SCANNED_FILES
      }
    } catch {
      assertActive(signal)
      return undefined
    }
  }
}
