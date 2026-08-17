import { relative } from 'node:path'
import { z } from 'zod'
import { CoreError } from '../domain/errors'
import { isWithinPath, resolveProjectPath } from '../infrastructure/workspace/path-policy'
import { DEFAULT_TOOL_OUTPUT_LIMIT, jsonToolResult } from './tool-result'
import { defineTool } from './tool-spec'

const schema = z.object({
  mode: z.enum(['unstaged', 'staged', 'head']).default('unstaged'),
  path: z.string().min(1).optional()
})

export const gitDiffTool = defineTool({
  name: 'git_diff',
  description: 'Read the unstaged, staged, or HEAD diff, optionally limited to one project path.',
  inputSchema: schema,
  hasSideEffects: false,
  fileAccess: 'read',
  shellAccess: false,
  lockMode: 'read',
  timeoutMs: 30_000,
  maxOutputChars: DEFAULT_TOOL_OUTPUT_LIMIT,
  async prepare(input, { project }) {
    if (!input.path) {
      return {
        input,
        access: [
          {
            kind: 'path',
            path: project.rootPath,
            mode: 'read',
            directory: true,
            title: '读取 Git 差异',
            detail: `git_diff ${input.mode}`
          }
        ]
      }
    }
    const absolutePath = await resolveProjectPath(project.rootPath, input.path, true)
    if (!isWithinPath(project.rootPath, absolutePath)) {
      throw new CoreError('path_outside_project', 'git_diff path must be inside the project')
    }
    return {
      input: { ...input, path: relative(project.rootPath, absolutePath) },
      access: [
        {
          kind: 'path',
          path: absolutePath,
          mode: 'read',
          directory: false,
          title: '读取 Git 差异',
          detail: `git_diff ${input.mode} ${input.path}`
        }
      ]
    }
  },
  async execute(input, { signal }, { project, git }) {
    return await git.diff(project, input.path, input.mode, signal)
  },
  format: jsonToolResult
})
