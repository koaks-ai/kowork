import { z } from 'zod'
import { resolveProjectPath } from '../infrastructure/workspace/path-policy'
import { DEFAULT_TOOL_OUTPUT_LIMIT, jsonToolResult } from './tool-result'
import { defineTool } from './tool-spec'

const schema = z.object({
  path: z.string().min(1),
  oldText: z.string().min(1),
  newText: z.string(),
  replaceAll: z.boolean().default(false)
})

export const editFileTool = defineTool({
  name: 'edit_file',
  description:
    'Replace exact text in one file. By default the old text must occur exactly once; set replaceAll to replace every occurrence.',
  inputSchema: schema,
  hasSideEffects: true,
  fileAccess: 'write',
  shellAccess: false,
  lockMode: 'write',
  timeoutMs: 30_000,
  maxOutputChars: DEFAULT_TOOL_OUTPUT_LIMIT,
  async prepare(input, { project }) {
    const path = await resolveProjectPath(project.rootPath, input.path, true)
    return {
      input: { ...input, path },
      access: [
        {
          kind: 'path',
          path,
          mode: 'write',
          directory: false,
          title: '修改文件',
          detail: `edit_file ${input.path}`
        }
      ]
    }
  },
  async execute(input, { signal }, { project, files }) {
    return await files.editForTool({ projectRoot: project.rootPath, ...input, signal })
  },
  format: jsonToolResult
})
