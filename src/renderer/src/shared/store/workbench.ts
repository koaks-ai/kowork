import { create } from 'zustand'

type InspectorTab = 'overview' | 'files' | 'changes'

interface WorkbenchState {
  projectId?: string
  threadId?: string
  inspectorTab: InspectorTab
  selectedFile?: string
  selectedChange?: string
  fileDirectory: string
  setProject(projectId?: string): void
  setThread(threadId?: string): void
  setInspectorTab(tab: InspectorTab): void
  setSelectedFile(path?: string): void
  setSelectedChange(path?: string): void
  setFileDirectory(path: string): void
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  inspectorTab: 'overview',
  fileDirectory: '.',
  setProject: (projectId) =>
    set({
      projectId,
      threadId: undefined,
      selectedFile: undefined,
      selectedChange: undefined,
      fileDirectory: '.'
    }),
  setThread: (threadId) => set({ threadId }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  setSelectedChange: (selectedChange) => set({ selectedChange }),
  setFileDirectory: (fileDirectory) => set({ fileDirectory, selectedFile: undefined })
}))
