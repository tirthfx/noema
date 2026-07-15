import type { SearchMatch } from '../../shared/types'
import { getVaultIndex } from '../index'

export async function searchNotes(vaultPath: string, query: string, topK = 5): Promise<SearchMatch[]> {
  return getVaultIndex(vaultPath).search(query, topK)
}
