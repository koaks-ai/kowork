import { dialog } from 'electron'
import type { CoreSupervisor } from '../core/core-supervisor'

export async function pickProject(supervisor: CoreSupervisor): Promise<unknown> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  return await supervisor.request('projects.add', { rootPath: result.filePaths[0] })
}
