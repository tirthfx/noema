import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateArtifact } from './agent'
import { getVaultIndex } from './index'

const vault = await mkdtemp(join(tmpdir(), 'noema-phase3-'))
await mkdir(join(vault, '.noema'), { recursive: true })
await writeFile(join(vault, 'benefits.md'), '# Distributed practice\nDistributed practice improves long-term retention because it spaces retrieval over time.\n')
await writeFile(join(vault, 'limits.md'), '# Distributed practice\nFor tightly constrained short-term cramming, distributed practice can be less efficient than concentrated review.\n')
await getVaultIndex(vault).refresh()
const result = await generateArtifact(vault, 'distributed practice', 'Academic', () => {})
if (!result.artifact || result.artifact.claims.length === 0) throw new Error(result.error ?? 'Artifact had no validated claims.')
if (result.artifact.claims.some((claim) => claim.citations.length === 0)) throw new Error('An uncited claim reached the artifact.')
if (result.artifact.tensions.length === 0) throw new Error('Expected the contradictory notes to produce a tension.')
console.log(`Validated ${result.artifact.claims.length} claims and ${result.artifact.tensions.length} tension(s).`)
