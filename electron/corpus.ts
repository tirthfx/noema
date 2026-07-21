import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, parse } from 'node:path'
import type { CorpusImportResult, VaultConfig } from '../shared/types'
import { writeVaultNote } from './vault'

const CORPUS_FOLDERS = ['Sources', 'Notes', 'Artifacts', 'Focus', 'Meetings', '.noema'] as const

function safeStem(path: string): string {
  return parse(basename(path)).name.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'source'
}

async function pathExists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

async function availableDestination(corpusPath: string, stem: string): Promise<string> {
  let suffix = 1
  while (true) {
    const fileName = suffix === 1 ? `${stem}.md` : `${stem}-${suffix}.md`
    const relativePath = join('Sources', fileName)
    if (!(await pathExists(join(corpusPath, relativePath)))) return relativePath
    suffix += 1
  }
}

export async function initializeCorpus(corpusPath: string, name = 'Noema Library'): Promise<Required<VaultConfig>> {
  await Promise.all(CORPUS_FOLDERS.map((folder) => mkdir(join(corpusPath, folder), { recursive: true })))
  const config: Required<VaultConfig> = { vaultPath: corpusPath, name, kind: 'noema' }
  await writeFile(join(corpusPath, '.noema', 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return config
}

export async function importCorpusFiles(corpusPath: string, sourcePaths: string[]): Promise<CorpusImportResult> {
  const result: CorpusImportResult = { imported: [], skipped: [] }
  for (const sourcePath of sourcePaths) {
    const extension = extname(sourcePath).toLowerCase()
    if (extension !== '.md' && extension !== '.txt') {
      result.skipped.push({ path: sourcePath, reason: 'Noema currently imports Markdown and plain-text files.' })
      continue
    }
    try {
      const stem = safeStem(sourcePath)
      const destination = await availableDestination(corpusPath, stem)
      const source = await readFile(sourcePath, 'utf8')
      const content = extension === '.txt' ? `# ${stem}\n\n${source.trim()}\n` : source
      await writeVaultNote(corpusPath, destination, content)
      result.imported.push(destination)
    } catch (error) {
      result.skipped.push({ path: sourcePath, reason: error instanceof Error ? error.message : 'Unable to import this file.' })
    }
  }
  return result
}
