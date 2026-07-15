export interface VaultConfig {
  vaultPath: string
}

export interface VaultSelection {
  vaultPath: string
}

export interface NoemaApi {
  vault: {
    getSaved: () => Promise<VaultSelection | null>
    choose: () => Promise<VaultSelection | null>
  }
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
  }
}
