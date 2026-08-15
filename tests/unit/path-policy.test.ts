import { mkdtemp, mkdir, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isWithinPath } from '@kowork/core'
import { canonicalizePath } from '../../packages/core/src/infrastructure/workspace/path-policy'

describe('workspace path policy', () => {
  it('detects symlink escapes after canonicalization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-path-'))
    const project = join(root, 'project')
    const external = join(root, 'external')
    await mkdir(project)
    await mkdir(external)
    await symlink(external, join(project, 'escape'))
    const canonicalProject = await realpath(project)
    const escaped = await canonicalizePath(join(project, 'escape'))
    expect(isWithinPath(canonicalProject, escaped)).toBe(false)
  })
})
