import { basename } from 'node:path'
import type { ProjectDto } from '@kowork/contracts'
import type { AppDatabase } from '../infrastructure/db/database'
import { assertDirectory, canonicalizePath } from '../infrastructure/workspace/path-policy'

export class ProjectService {
  constructor(private readonly database: AppDatabase) {}

  list(includeDeleted = false): ProjectDto[] {
    return this.database.listProjects(includeDeleted)
  }

  async add(rootPath: string): Promise<ProjectDto> {
    const canonicalRoot = await canonicalizePath(rootPath)
    await assertDirectory(canonicalRoot)
    return this.database.addProject(canonicalRoot, basename(canonicalRoot))
  }

  archive(projectId: string): ProjectDto {
    return this.database.updateProjectDeleted(projectId, Date.now())
  }

  restore(projectId: string): ProjectDto {
    return this.database.updateProjectDeleted(projectId, null)
  }
}
