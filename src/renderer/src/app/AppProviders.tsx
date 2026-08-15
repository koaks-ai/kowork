import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Tooltip from '@radix-ui/react-tooltip'
import type { PropsWithChildren } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 }
  }
})

export function AppProviders({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={350}>{children}</Tooltip.Provider>
    </QueryClientProvider>
  )
}
