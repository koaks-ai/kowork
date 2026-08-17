export type SystemBackdrop = 'vibrancy' | 'mica' | 'none'

export interface HostPlatformInfo {
  os: string
  backdrop: SystemBackdrop
}

const WINDOWS_MICA_MIN_BUILD = 22621

export function resolveSystemBackdrop(platform: string, systemVersion: string): SystemBackdrop {
  if (platform === 'darwin') return 'vibrancy'
  if (platform === 'win32') {
    const build = Number.parseInt(systemVersion.split('.')[2] ?? '', 10)
    return Number.isFinite(build) && build >= WINDOWS_MICA_MIN_BUILD ? 'mica' : 'none'
  }
  return 'none'
}

export function resolveHostPlatform(platform: string, systemVersion: string): HostPlatformInfo {
  return {
    os: platform,
    backdrop: resolveSystemBackdrop(platform, systemVersion)
  }
}
