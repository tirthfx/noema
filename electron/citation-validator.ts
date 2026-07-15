import { basename } from 'node:path'
import type { Artifact, ArtifactClaim, Citation } from '../shared/types'
import { readNote } from './tools/read-note'

function normalize(value: string): string { return value.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim() }
function nearMatch(note: string, quote: string): boolean {
  const source = normalize(note); const target = normalize(quote)
  if (target.length < 12) return false
  if (source.includes(target)) return true
  const words = target.split(' ').filter(Boolean)
  if (words.length < 6) return false
  const bigrams = words.slice(1).map((word, index) => `${words[index]} ${word}`)
  const matchingBigrams = bigrams.filter((bigram) => source.includes(bigram)).length
  return matchingBigrams / bigrams.length >= 0.9
}

function sourcePassage(note: string, quote: string): string | null {
  if (note.includes(quote)) return quote
  const target = normalize(quote).split(' ').filter(Boolean)
  const candidates = note.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
  const best = candidates.map((candidate) => {
    const source = normalize(candidate)
    const matches = target.slice(1).filter((word, index) => source.includes(`${target[index]} ${word}`)).length
    return { candidate, score: matches / Math.max(1, target.length - 1) }
  }).sort((left, right) => right.score - left.score)[0]
  return best?.score >= 0.9 ? best.candidate : null
}

async function validateCitation(vaultPath: string, citation: Citation): Promise<Citation | null> {
  if (typeof citation.path !== 'string' || typeof citation.quote !== 'string') return null
  const note = await readNote(vaultPath, citation.path)
  if (!note || !nearMatch(note, citation.quote)) return null
  const quote = sourcePassage(note, citation.quote)
  return quote ? { path: citation.path, quote, title: basename(citation.path, '.md') } : null
}

async function validateClaim(vaultPath: string, claim: ArtifactClaim): Promise<ArtifactClaim | null> {
  if (!claim || typeof claim.text !== 'string' || !Array.isArray(claim.citations)) return null
  const citations = (await Promise.all(claim.citations.map((citation) => validateCitation(vaultPath, citation)))).filter((citation): citation is Citation => citation !== null)
  return citations.length ? { text: claim.text, citations } : null
}

export async function validateArtifact(vaultPath: string, draft: Artifact): Promise<Artifact> {
  const claims = (await Promise.all(draft.claims.map((claim) => validateClaim(vaultPath, claim)))).filter((claim): claim is ArtifactClaim => claim !== null)
  const tensions = []
  for (const tension of draft.tensions) {
    const sides = (await Promise.all(tension.sides.map((side) => validateClaim(vaultPath, side)))).filter((side): side is ArtifactClaim => side !== null)
    if (sides.length >= 2 && typeof tension.question === 'string') tensions.push({ question: tension.question, sides })
  }
  return { title: draft.title, claims, tensions }
}
