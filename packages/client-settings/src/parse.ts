import { clientSettingsSchema, type ClientSettings } from './schema'
import { ClientSettingsParseError } from './errors'

export function parseClientSettings(input: unknown): ClientSettings {
  const result = clientSettingsSchema.safeParse(input)
  if (result.success) return result.data
  throw new ClientSettingsParseError(
    result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '$',
      message: issue.message
    }))
  )
}
