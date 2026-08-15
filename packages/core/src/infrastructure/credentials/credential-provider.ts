export interface CredentialProvider {
  get(providerId: string): Promise<string | undefined>
}

export const emptyCredentialProvider: CredentialProvider = {
  get: async () => undefined
}
