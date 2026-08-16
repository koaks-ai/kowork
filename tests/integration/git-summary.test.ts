import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { CoreApplication } from '@kowork/core'

const exec = promisify(execFile)
const applications: CoreApplication[] = []

afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.close()))
})

describe('Git summary', () => {
  it('reports the current branch and working tree line changes', async () => {
    const dataPath = await mkdtemp(join(tmpdir(), 'kowork-git-summary-'))
    const projectPath = join(dataPath, 'project')
    await mkdir(projectPath)
    await exec('git', ['init', '-b', 'main'], { cwd: projectPath })
    await exec('git', ['config', 'user.name', 'KoWork Test'], { cwd: projectPath })
    await exec('git', ['config', 'user.email', 'kowork-test@example.invalid'], {
      cwd: projectPath
    })
    await writeFile(join(projectPath, 'example.txt'), 'first\nsecond\n')
    await exec('git', ['add', 'example.txt'], { cwd: projectPath })
    await exec('git', ['commit', '-m', 'Initial fixture'], { cwd: projectPath })
    await writeFile(join(projectPath, 'example.txt'), 'first\nchanged\nthird\n')

    const application = new CoreApplication(dataPath, undefined, true)
    applications.push(application)
    const project = await application.handle('projects.add', { rootPath: projectPath })

    await expect(application.handle('git.summary', { projectId: project.id })).resolves.toEqual({
      branch: 'main',
      additions: 2,
      deletions: 1
    })
  })
})
