import { z } from 'zod'

export const accentIdSchema = z.enum(['blue', 'teal', 'violet', 'rose', 'amber', 'emerald'])
export type AccentId = z.infer<typeof accentIdSchema>

export const accentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('preset'), id: accentIdSchema }).strict(),
  z.object({ type: z.literal('custom'), hex: z.string().regex(/^#[0-9a-f]{6}$/u) }).strict()
])
export type Accent = z.infer<typeof accentSchema>

export const backgroundAssetIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpeg|webp|gif)$/u
  )

export const backgroundSchema = z
  .object({
    assetId: backgroundAssetIdSchema,
    blurPx: z.number().finite().min(0).max(64),
    surfaceOpacity: z.number().finite().min(0.45).max(0.95)
  })
  .strict()
export type ClientBackground = z.infer<typeof backgroundSchema>

export const appearanceSchema = z
  .object({
    colorScheme: z.enum(['light', 'dark', 'system']),
    accent: accentSchema,
    background: backgroundSchema.nullable()
  })
  .strict()
export type AppearanceSettings = z.infer<typeof appearanceSchema>

export const layoutSchema = z
  .object({
    leftSidebarWidth: z.number().finite().min(220).max(420),
    rightSidebarWidth: z.number().finite().min(280).max(520),
    settingsProviderListWidth: z.number().finite().min(168).max(360)
  })
  .strict()
export type ClientLayout = z.infer<typeof layoutSchema>
export type ClientLayoutKey = keyof ClientLayout

export const clientSettingsSchema = z
  .object({
    version: z.literal(1),
    appearance: appearanceSchema,
    layout: layoutSchema,
    locale: z.literal('zh-CN')
  })
  .strict()
export type ClientSettings = z.infer<typeof clientSettingsSchema>

export const clientSettingsPatchSchema = z.discriminatedUnion('section', [
  z.object({ section: z.literal('appearance'), value: appearanceSchema }).strict(),
  z.object({ section: z.literal('layout'), value: layoutSchema }).strict(),
  z.object({ section: z.literal('locale'), value: z.literal('zh-CN') }).strict()
])
export type ClientSettingsPatch = z.infer<typeof clientSettingsPatchSchema>

export const legacyLayoutInputSchema = z
  .object({
    leftSidebarWidth: z.unknown().optional(),
    rightSidebarWidth: z.unknown().optional(),
    settingsProviderListWidth: z.unknown().optional()
  })
  .strict()
export type LegacyLayoutInput = z.infer<typeof legacyLayoutInputSchema>

export const resolvedColorSchemeSchema = z.enum(['light', 'dark'])
export type ResolvedColorScheme = z.infer<typeof resolvedColorSchemeSchema>

export const clientSettingsSnapshotSchema = clientSettingsSchema
  .extend({ resolvedColorScheme: resolvedColorSchemeSchema })
  .strict()
export type ClientSettingsSnapshot = z.infer<typeof clientSettingsSnapshotSchema>
