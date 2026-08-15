import { startApplication } from './bootstrap/application'

void startApplication().catch((error) => {
  console.error('Failed to start KoWork', error)
  process.exitCode = 1
})
