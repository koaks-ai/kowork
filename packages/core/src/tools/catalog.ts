import { editFileTool } from './edit-file'
import { gitDiffTool } from './git-diff'
import { gitStatusTool } from './git-status'
import { globFilesTool } from './glob-files'
import { listFilesTool } from './list-files'
import { readFileTool } from './read-file'
import { runCommandTool } from './run-command'
import { searchFilesTool } from './search-files'
import type { ToolSpec } from './tool-spec'
import { writeFileTool } from './write-file'

export function coreToolSpecs(): ToolSpec[] {
  return [
    listFilesTool,
    globFilesTool,
    readFileTool,
    searchFilesTool,
    editFileTool,
    writeFileTool,
    runCommandTool,
    gitStatusTool,
    gitDiffTool
  ]
}
