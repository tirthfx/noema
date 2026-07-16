import { mkdtemp, mkdir, readdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetchReadable, htmlToText } from './capture'
import { readVaultNote, writeVaultNote } from './vault'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const vault = await mkdtemp(join(tmpdir(), 'noema-phase0-'))
const outside = await mkdtemp(join(tmpdir(), 'noema-outside-'))
await mkdir(join(vault, '.noema'), { recursive: true })

await writeVaultNote(vault, 'Research/atomic.md', '# Atomic write\n')
assert(await readVaultNote(vault, 'Research/atomic.md') === '# Atomic write\n', 'Expected a vault note to be written and read back.')
const files = await readdir(join(vault, 'Research'))
assert(!files.some((file) => file.endsWith('.tmp')), 'Temporary write files must be cleaned up.')

await symlink(outside, join(vault, 'Escapes'))
let symlinkRejected = false
try {
  await writeVaultNote(vault, 'Escapes/outside.md', '# Should not escape\n')
} catch (error) {
  symlinkRejected = typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ELOOP'
}
assert(symlinkRejected, 'Expected writes through a vault symlink to be rejected.')
await writeFile(join(outside, 'secret.md'), '# Outside vault\n')
await symlink(join(outside, 'secret.md'), join(vault, 'leak.md'))
assert(await readVaultNote(vault, 'leak.md') === null, 'Reads through a vault symlink must be rejected.')

assert(htmlToText('<title>Safe</title><p>&#x110000;</p>').text.includes('&#x110000;'), 'Invalid numeric HTML entities must remain readable instead of throwing.')
let privateUrlRejected = false
try { await fetchReadable('http://127.0.0.1/private') } catch (error) { privateUrlRejected = error instanceof Error && error.message.includes('private network') }
assert(privateUrlRejected, 'Expected private-network URL capture to be rejected before fetching.')

console.log('Phase 0 verified: atomic writes, symlink containment, and safe URL capture.')
