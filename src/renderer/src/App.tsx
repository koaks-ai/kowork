import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { ResizablePanel } from './shared/ui/ResizablePanel'
import { ConversationWorkspace } from './widgets/ConversationWorkspace'
import { InspectorPanel } from './features/inspector'
import { ProjectSidebar } from './widgets/ProjectSidebar'
import { StatusBar } from './widgets/StatusBar'

function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const bootstrap = useQuery({ queryKey: ['bootstrap'], queryFn: () => window.kowork.bootstrap() })
  const isMacOS = window.kowork.platform.os === 'darwin'
  const frosted = window.kowork.platform.backdrop !== 'none'
  if (bootstrap.isLoading)
    return (
      <div className="grid h-screen place-items-center bg-kw-canvas text-sm text-kw-text-muted">
        KoWork
      </div>
    )
  if (bootstrap.isError || !bootstrap.data)
    return (
      <div className="grid h-screen place-items-center bg-kw-canvas px-8 text-center text-sm text-kw-danger">
        {bootstrap.error instanceof Error ? bootstrap.error.message : 'KoWork Core unavailable'}
      </div>
    )
  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      <ResizablePanel
        side="left"
        defaultWidth={264}
        minWidth={220}
        maxWidth={420}
        storageKey="kowork:left-sidebar-width"
        resizeLabel={t('resizeProjectSidebar')}
      >
        <ProjectSidebar bootstrap={bootstrap.data} isMacOS={isMacOS} frosted={frosted} />
      </ResizablePanel>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-kw-surface">
        <div className="flex min-h-0 flex-1">
          <ConversationWorkspace
            bootstrap={bootstrap.data}
            inspectorOpen={inspectorOpen}
            onInspectorToggle={() => {
              setInspectorOpen((open) => !open)
            }}
          />
          <ResizablePanel
            side="right"
            defaultWidth={332}
            minWidth={280}
            maxWidth={520}
            storageKey="kowork:right-sidebar-width"
            resizeLabel={t('resizeInspectorPanel')}
            collapsed={!inspectorOpen}
          >
            <InspectorPanel bootstrap={bootstrap.data} />
          </ResizablePanel>
        </div>
        <StatusBar bootstrap={bootstrap.data} />
      </div>
    </div>
  )
}

export default App
