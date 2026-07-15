import { readVaultNote } from '../vault'

export async function readNote(vaultPath: string, path: string): Promise<string | null> {
  return readVaultNote(vaultPath, path)
}
