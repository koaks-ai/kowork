import { realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { CoreError } from '../../domain/errors'

export function isWithinPath(rootPath: string, targetPath: string): boolean {
  const relation = relative(rootPath, targetPath)
  return (
    relation === '' ||
    (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation))
  )
}

export async function canonicalizePath(targetPath: string, forWrite = false): Promise<string> {
  const normalized = normalize(resolve(targetPath))
  if (!forWrite) {
    try {
      return await realpath(normalized)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      throw new CoreError(
        code === 'ENOENT' ? 'path_not_found' : 'path_not_resolvable',
        `Cannot resolve path '${targetPath}'`
      )
    }
  }
  let existing = normalized
  const missing: string[] = []
  while (true) {
    try {
      const base = await realpath(existing)
      return join(base, ...missing.reverse())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new CoreError('path_not_resolvable', `Cannot resolve path '${targetPath}'`)
      }
      const parent = dirname(existing)
      if (parent === existing)
        throw new CoreError('path_not_resolvable', `Cannot resolve path '${targetPath}'`)
      missing.push(existing.slice(parent.length + 1))
      existing = parent
    }
  }
}

export async function resolveProjectPath(
  rootPath: string,
  requestedPath: string,
  forWrite = false
): Promise<string> {
  const candidate = isAbsolute(requestedPath) ? requestedPath : join(rootPath, requestedPath)
  return await canonicalizePath(candidate, forWrite)
}

export async function assertDirectory(path: string): Promise<void> {
  const info = await stat(path)
  if (!info.isDirectory()) throw new CoreError('not_a_directory', `'${path}' is not a directory`)
}

export function authorizedByAnyRoot(targetPath: string, roots: string[]): boolean {
  return roots.some((root) => isWithinPath(root, targetPath))
}
