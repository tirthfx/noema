import { useRef } from 'react'
import { ArrowRight, Check, FolderOpen, LockKey, Plus } from '@phosphor-icons/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import iconUrl from '../../build/icon.png'

gsap.registerPlugin(ScrollTrigger)

const REVEAL_COPY = 'Noema remembers the source, the decision, and the unfinished thought—without turning your private work into someone else’s dataset.'

export default function CorpusOnboarding({
  loading,
  busy,
  progress,
  error,
  onCreate,
  onConnect
}: {
  loading: boolean
  busy: boolean
  progress: string | null
  error: string | null
  onCreate: () => void
  onConnect: () => void
}) {
  const scope = useRef<HTMLElement>(null)

  useGSAP(() => {
    const scroller = scope.current
    if (loading || !scroller) return
    gsap.from('.onboarding-enter', {
      y: 24,
      opacity: 0,
      duration: 0.72,
      stagger: 0.07,
      ease: 'power3.out'
    })
    gsap.from('.memory-cell', {
      y: 34,
      opacity: 0,
      duration: 0.8,
      stagger: 0.08,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.memory-grid', scroller, start: 'top 78%' }
    })
    gsap.to('.stack-card', {
      y: (index) => index * -34,
      scale: (index) => 1 - index * 0.035,
      ease: 'none',
      scrollTrigger: {
        trigger: '.corpus-stack',
        scroller,
        start: 'top 72%',
        end: 'bottom 38%',
        scrub: true
      }
    })
    gsap.fromTo('.reveal-word', { opacity: 0.14 }, {
      opacity: 1,
      stagger: 0.08,
      ease: 'none',
      scrollTrigger: {
        trigger: '.onboarding-reveal',
        scroller,
        start: 'top 74%',
        end: 'bottom 48%',
        scrub: true
      }
    })
    ScrollTrigger.refresh()
  }, { scope, dependencies: [loading] })

  if (loading) {
    return <main className="corpus-loading"><img src={iconUrl} alt="" /><p>{progress ?? 'Opening your private corpus…'}</p></main>
  }

  return <main className="corpus-onboarding" ref={scope}>
    <nav className="onboarding-nav onboarding-enter" aria-label="Noema introduction">
      <a href="#top" className="onboarding-brand"><img src={iconUrl} alt="" /><span>Noema</span></a>
      <span><LockKey size={14} /> Local-first by design</span>
    </nav>

    <section className="onboarding-hero" id="top">
      <div className="onboarding-hero-copy">
        <p className="onboarding-enter hero-proof"><Check size={15} weight="bold" /> Your own searchable corpus</p>
        <h1 className="onboarding-enter" aria-label="Your work should remember what you were thinking."><span className="hero-line">Your <span className="inline-mark"><img src={iconUrl} alt="" /></span> work</span><span className="hero-line">should remember</span><span className="hero-line">what you were thinking.</span></h1>
        <p className="onboarding-enter hero-summary">Noema turns notes, meetings, captures, and focus checkpoints into a private memory you can question, revisit, and build from.</p>
        <div className="onboarding-actions onboarding-enter">
          <button className="primary-action onboarding-primary" onClick={onCreate} disabled={busy}><Plus size={17} />{busy ? 'Preparing corpus…' : 'Create my corpus'}</button>
          <button className="quiet-button onboarding-secondary" onClick={onConnect} disabled={busy}><FolderOpen size={17} />Connect a folder</button>
        </div>
        {error && <p className="onboarding-error" role="alert">{error}</p>}
        <p className="onboarding-enter path-note">Creates <strong>Documents/Noema Library</strong>. Obsidian stays an optional connector.</p>
      </div>

      <div className="onboarding-dossier onboarding-enter" aria-label="Example Noema memory">
        <div className="dossier-rule"><span>ACTIVE CORPUS</span><span>LOCAL</span></div>
        <h2>Prometheus learning loop</h2>
        <p className="dossier-path">Sources / product-notes.md</p>
        <blockquote>Students need guidance that is practical, evidence-backed, and never shaming.</blockquote>
        <div className="dossier-links"><span>Related</span><strong>Mock test analysis</strong><strong>Promi behavior spec</strong></div>
        <div className="dossier-question"><span>Suggested next question</span><p>Where does the current flow stop being supportive?</p></div>
      </div>
    </section>

    <div className="source-marquee" aria-hidden="true">
      <div>{['MARKDOWN NOTES', 'MEETING RECAPS', 'FOCUS CHECKPOINTS', 'WEB CAPTURES', 'APPROVED ARTIFACTS', 'PLAIN TEXT', 'MARKDOWN NOTES', 'MEETING RECAPS', 'FOCUS CHECKPOINTS', 'WEB CAPTURES', 'APPROVED ARTIFACTS', 'PLAIN TEXT'].map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div>
    </div>

    <section className="memory-section">
      <div className="onboarding-section-heading"><h2>A continuity loop for real work.</h2><p>Borrowing the useful idea from ambient assistants, while keeping every capture explicit and every source inspectable.</p></div>
      <div className="memory-grid">
        <article className="memory-cell memory-context"><span>01</span><h3>Full-context Ask</h3><p>Question your entire corpus. Answers show the passages that support them and degrade honestly when generation is unavailable.</p><div className="context-query">What did I decide about the student feedback loop?</div></article>
        <article className="memory-cell memory-meetings"><span>02</span><h3>Meeting memory</h3><p>Paste a transcript. Noema proposes a recap, decisions, and tasks before anything is saved.</p></article>
        <article className="memory-cell memory-routines"><span>03</span><h3>Daily orientation</h3><p>Suggested prompts surface unfinished work and fading ideas.</p></article>
        <article className="memory-cell memory-evidence"><span>04</span><h3>Evidence stays attached</h3><p>Every claim can lead you back to its note.</p></article>
      </div>
    </section>

    <section className="accordion-section">
      <div className="onboarding-section-heading"><h2>Your corpus, in layers.</h2><p>Simple files underneath. A thoughtful working surface above them.</p></div>
      <div className="corpus-accordion">
        {[
          ['Sources', 'Original Markdown and text you explicitly bring in.'],
          ['Notes', 'Ideas you write or approve from capture drafts.'],
          ['Memory', 'Focus checkpoints, meetings, and the timeline of real work.'],
          ['Artifacts', 'Grounded reviews and synthesis built from your evidence.']
        ].map(([title, copy], index) => <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{copy}</p></article>)}
      </div>
    </section>

    <section className="corpus-story">
      <div className="corpus-stack" aria-hidden="true">
        <article className="stack-card"><span>MEETING / JUL 19</span><h3>Ship the owned-corpus flow</h3><p>Decision: Obsidian is a connector, not the product identity.</p></article>
        <article className="stack-card"><span>FOCUS / 42 MIN</span><h3>Refine retrieval states</h3><p>Checkpoint: show sources even when the model times out.</p></article>
        <article className="stack-card"><span>SOURCE / VISION.MD</span><h3>Build memory you can inspect</h3><p>Local ownership is the feature, not a footnote.</p></article>
      </div>
      <div className="onboarding-reveal"><p>{REVEAL_COPY.split(' ').map((word, index) => <span className="reveal-word" key={`${word}-${index}`}>{word} </span>)}</p></div>
    </section>

    <section className="onboarding-action">
      <img src={iconUrl} alt="" />
      <h2>Start with a corpus you own.</h2>
      <p>Add files when you choose. Ask better questions. Recover the thread without recording your life.</p>
      <div className="onboarding-actions">
        <button className="primary-action onboarding-primary" onClick={onCreate} disabled={busy}>Create Noema Library <ArrowRight size={17} /></button>
        <button className="quiet-button onboarding-secondary" onClick={onConnect} disabled={busy}>Connect existing folder</button>
      </div>
    </section>
  </main>
}
