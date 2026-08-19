import { protocol } from 'electron'
import { startApplication } from './bootstrap/application'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kowork-bg',
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

void startApplication().catch((error) => {
  console.error('Failed to start KoWork', error)
  process.exitCode = 1
})
