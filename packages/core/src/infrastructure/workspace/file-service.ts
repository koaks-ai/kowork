import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { applyPatch } from 'diff'
import type { FileContentDto, FileEntryDto, ProjectDto } from '@kowork/contracts'
import { CoreError } from '../../domain/errors'
import { isWithinPath, resolveProjectPath } from './path-policy'

const ignoredNames = new Set(['.git', 'node_modules', '.DS_Store', 'out', 'dist'])

export class FileService {
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

  async readForTool(authorizedPath: string): Promise<string> {
    return await readFile(authorizedPath, 'utf8')
  }

  async listForTool(authorizedPath: string): Promise<string> {
    const entries = await readdir(authorizedPath, { withFileTypes: true })
    return JSON.stringify(
      entries
        .filter((entry) => !ignoredNames.has(entry.name))
        .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }))
    )
  }

  async applyPatchForTool(authorizedPath: string, patch: string): Promise<string> {
    let source = ''
    try {
      source = await readFile(authorizedPath, 'utf8')
    } catch {
      source = ''
    }
    const updated = applyPatch(source, patch)
    if (updated === false)
      throw new CoreError('patch_failed', `Patch could not be applied to '${authorizedPath}'`)
    await mkdir(dirname(authorizedPath), { recursive: true })
    await writeFile(authorizedPath, updated, 'utf8')
    return `Applied patch to ${authorizedPath}`
  }

  async search(project: ProjectDto, query: string, relativePath = '.'): Promise<string> {
    const root = await resolveProjectPath(project.rootPath, relativePath)
    if (!isWithinPath(project.rootPath, root))
      throw new CoreError('path_outside_project', `'${relativePath}' is outside the project`)
    return await this.searchDirectory(root, query)
  }

  async searchForTool(authorizedPath: string, query: string): Promise<string> {
    return await this.searchDirectory(authorizedPath, query)
  }

  private async searchDirectory(root: string, query: string): Promise<string> {
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
              matches.push(`${relative(root, path)}:${index + 1}:${line}`)
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
}
