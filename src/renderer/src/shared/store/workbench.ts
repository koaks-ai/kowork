import { create } from 'zustand'

interface WorkbenchState {
  projectId?: string
  threadId?: string
  setProject(projectId?: string): void
  setThread(threadId?: string): void
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  setProject: (projectId) =>
    set({
      projectId,
      threadId: undefined
    }),
  setThread: (threadId) => set({ threadId })
}))
