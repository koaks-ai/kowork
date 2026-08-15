import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { applyPatch } from 'diff'
import type { FileContentDto, FileEntryDto, ProjectDto, ThreadDto } from '@kowork/contracts'
import { CoreError } from '../../domain/errors'
import type { ApprovalService } from '../../application/approval-service'
import { isWithinPath, resolveProjectPath } from './path-policy'

const ignoredNames = new Set(['.git', 'node_modules', '.DS_Store', 'out', 'dist'])

export class FileService {
  constructor(private readonly approvals: ApprovalService) {}

  async list(project: ProjectDto, relativePath = '.'): Promise<FileEntryDto[]> {
    const directory = await resolveProjectPath(project.rootPath, relativePath)
    if (!isWithinPath(project.rootPath, directory))
      throw new CoreError('path_outside_project', `'${relativePath}' is outside the project`)
    const entries = await readdir(directory, { withFileTypes: true })
    const result: FileEntryDto[] = []
    for (const entry of entries) {
      if (ignoredNames.has(entry.name)) continue
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
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1
    )
  }

  async read(project: ProjectDto, relativePath: string): Promise<FileContentDto> {
    const path = await resolveProjectPath(project.rootPath, relativePath)
    if (!isWithinPath(project.rootPath, path))
      throw new CoreError('path_outside_project', `'${relativePath}' is outside the project`)
    const info = await stat(path)
    if (!info.isFile()) throw new CoreError('not_a_file', `'${relativePath}' is not a file`)
    if (info.size > 2 * 1024 * 1024)
      throw new CoreError('file_too_large', `'${relativePath}' is larger than 2 MB`)
    const buffer = await readFile(path)
    if (buffer.includes(0)) throw new CoreError('binary_file', `'${relativePath}' is a binary file`)
    return {
      relativePath,
      content: buffer.toString('utf8'),
      size: info.size,
      modifiedAt: info.mtimeMs
    }
  }

  async readForTool(input: {
    project: ProjectDto
    thread: ThreadDto
    runId: string
    path: string
  }): Promise<string> {
    const requested = await resolveProjectPath(input.project.rootPath, input.path)
    const authorized = await this.approvals.authorizePath({
      ...input,
      targetPath: requested,
      write: false,
      title: '读取文件',
      detail: `读取 ${requested}`
    })
    return await readFile(authorized, 'utf8')
  }

  async listForTool(input: {
    project: ProjectDto
    thread: ThreadDto
    runId: string
    path: string
  }): Promise<string> {
    const requested = await resolveProjectPath(input.project.rootPath, input.path)
    const authorized = await this.approvals.authorizePath({
      ...input,
      targetPath: requested,
      targetIsDirectory: true,
      write: false,
      title: '列出目录',
      detail: `列出 ${requested}`
    })
    const entries = await readdir(authorized, { withFileTypes: true })
    return JSON.stringify(
      entries
        .filter((entry) => !ignoredNames.has(entry.name))
        .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }))
    )
  }

  async applyPatch(input: {
    project: ProjectDto
    thread: ThreadDto
    runId: string
    path: string
    patch: string
  }): Promise<string> {
    const requested = await resolveProjectPath(input.project.rootPath, input.path, true)
    const authorized = await this.approvals.authorizePath({
      ...input,
      targetPath: requested,
      write: true,
      title: '修改文件',
      detail: `应用补丁到 ${requested}`
    })
    let source = ''
    try {
      source = await readFile(authorized, 'utf8')
    } catch {
      source = ''
    }
    const updated = applyPatch(source, input.patch)
    if (updated === false)
      throw new CoreError('patch_failed', `Patch could not be applied to '${input.path}'`)
    await mkdir(dirname(authorized), { recursive: true })
    await writeFile(authorized, updated, 'utf8')
    return `Applied patch to ${input.path}`
  }

  async search(project: ProjectDto, query: string, relativePath = '.'): Promise<string> {
    const root = await resolveProjectPath(project.rootPath, relativePath)
    if (!isWithinPath(project.rootPath, root))
      throw new CoreError('path_outside_project', `'${relativePath}' is outside the project`)
    const matches: string[] = []
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (ignoredNames.has(entry.name) || matches.length >= 200) continue
        const path = await resolveProjectPath(directory, entry.name)
        if (entry.isDirectory()) {
          await walk(path)
          continue
        }
        try {
          const content = await readFile(path, 'utf8')
          const lines = content.split(/\r?\n/)
          lines.forEach((line, index) => {
            if (matches.length < 200 && line.toLowerCase().includes(query.toLowerCase())) {
              matches.push(`${relative(project.rootPath, path)}:${index + 1}:${line}`)
            }
          })
        } catch {
          // Binary and unreadable files are skipped.
        }
      }
    }
    await walk(root)
    return matches.length === 0 ? 'No matches found.' : matches.join('\n')
  }

  async searchForTool(input: {
    project: ProjectDto
    thread: ThreadDto
    runId: string
    query: string
    path: string
  }): Promise<string> {
    const requested = await resolveProjectPath(input.project.rootPath, input.path)
    await this.approvals.authorizePath({
      ...input,
      targetPath: requested,
      targetIsDirectory: true,
      write: false,
      title: '搜索目录',
      detail: `在 ${requested} 中搜索 ${input.query}`
    })
    return await this.search({ ...input.project, rootPath: requested }, input.query, '.')
  }
}
