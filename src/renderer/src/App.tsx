import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ResizablePanel } from './shared/ui/ResizablePanel'
import { ConversationWorkspace } from './widgets/ConversationWorkspace'
import { InspectorPanel } from './widgets/InspectorPanel'
import { ProjectSidebar } from './widgets/ProjectSidebar'
import { StatusBar } from './widgets/StatusBar'

function App(): React.JSX.Element {
  const { t } = useTranslation()
  const bootstrap = useQuery({ queryKey: ['bootstrap'], queryFn: () => window.kowork.bootstrap() })
  const isMacOS = window.kowork.platform.os === 'darwin'
  const frosted = window.kowork.platform.backdrop !== 'none'
  if (bootstrap.isLoading)
    return (
      <div className="grid h-screen place-items-center bg-white text-sm text-neutral-500">
        KoWork
      </div>
    )
  if (bootstrap.isError || !bootstrap.data)
    return (
      <div className="grid h-screen place-items-center bg-white px-8 text-center text-sm text-red-700">
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        <div className="flex min-h-0 flex-1">
          <ConversationWorkspace bootstrap={bootstrap.data} />
          <ResizablePanel
            side="right"
            defaultWidth={332}
            minWidth={280}
            maxWidth={520}
            storageKey="kowork:right-sidebar-width"
            resizeLabel={t('resizeInspectorPanel')}
            className="hidden xl:block"
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
