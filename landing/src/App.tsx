import { motion } from 'framer-motion'
import { Koi } from './components/Koi'
import { Masthead } from './components/Masthead'
import { Reveal } from './components/Reveal'
import { Terminal } from './components/Terminal'
import { Envelope } from './components/Envelope'
import { problems, verbs, features, stages } from './data'

const EASE = [0.16, 1, 0.3, 1] as const

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
}
const lineUp = {
  hidden: { y: '115%' },
  show: { y: '0%', transition: { duration: 0.9, ease: EASE } },
}

export default function App() {
  return (
    <>
      <Masthead />

      {/* ---------- hero ---------- */}
      <section className="hero" aria-labelledby="wordmark">
        <Koi className="koi koi--tl" />
        <Koi className="koi koi--br" />

        <motion.div className="hero__inner" variants={container} initial="hidden" animate="show">
          <motion.p className="hero__track" variants={item}>
            devtools &amp; infrastructure · secrets, versioned
          </motion.p>

          <h1 className="wordmark" id="wordmark">
            <span className="wordmark__line" data-text="WEN">
              <motion.span style={{ display: 'inline-block' }} variants={lineUp}>WEN</motion.span>
            </span>
            <span className="wordmark__line" data-text="VY">
              <motion.span style={{ display: 'inline-block' }} variants={lineUp}>VY</motion.span>
            </span>
          </h1>

          <motion.p className="hero__hand" variants={item}>
            don’t just manage secrets, version them.
          </motion.p>

          <motion.div className="hero__lede" variants={item}>
            <p>
              A <strong>zero-knowledge</strong>, <strong>SSH-first</strong>, end-to-end encrypted platform that syncs your
              {' '}<code>.env</code> the way Git syncs your code. Plaintext never leaves your machine. The server stores
              only ciphertext it can never read.
            </p>
          </motion.div>

          <motion.div className="hero__actions" variants={item}>
            <a className="btn btn--solid" href="#flow">see it push <span aria-hidden="true">→</span></a>
            <a className="btn btn--ghost" href="#model">how the crypto works</a>
          </motion.div>
        </motion.div>
      </section>

      {/* ---------- problem ---------- */}
      <section className="band band--ink" id="problem">
        <Reveal className="band__head">
          <span className="numeral">01</span>
          <h2 className="huge">The <span className="u">.env</span> file is where security goes to die.</h2>
        </Reveal>
        <div className="ledger">
          {problems.map((p, i) => (
            <Reveal as="div" className="ledger__row" key={p.n} delay={i * 0.06}>
              <span className="ledger__n">{p.n}</span>
              <h3>{p.title}</h3>
              <p>{renderBody(p.body, 'code' in p ? p.code : undefined)}</p>
              <span className="ledger__tag">{p.tag}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- model ---------- */}
      <section className="band band--paper" id="model">
        <Reveal className="band__head">
          <span className="numeral numeral--ink">02</span>
          <h2 className="huge huge--ink">Zero-knowledge by construction.<br />Not by promise.</h2>
        </Reveal>
        <div className="model">
          <Reveal className="model__copy">
            <p className="lead">
              Wenvy encrypts every snapshot on your device before it ever touches the wire. Secrets are sealed in a
              three-layer envelope, so a full database or object-store breach leaks nothing but ciphertext.
            </p>
            <dl className="defs">
              <div><dt>Snapshot</dt><dd>Your canonical <code>.env</code>, sealed with a per-repo key using XChaCha20-Poly1305.</dd></div>
              <div><dt>Repo key</dt><dd>Wrapped by the team key, rotated on revocation, never re-encrypting old blobs.</dd></div>
              <div><dt>Team key</dt><dd>Wrapped for each member’s SSH key via X25519. Add a device, re-wrap a key, and that’s it.</dd></div>
              <div><dt>Your SSH key</dt><dd>The root of trust. The private half never leaves your machine.</dd></div>
            </dl>
          </Reveal>
          <Reveal delay={0.1}><Envelope /></Reveal>
        </div>
      </section>

      {/* ---------- workflow ---------- */}
      <section className="band band--ink" id="flow">
        <Reveal className="band__head">
          <span className="numeral">03</span>
          <h2 className="huge">It feels exactly like Git.<br />Because it should.</h2>
        </Reveal>
        <div className="flow">
          <Reveal><Terminal /></Reveal>
          <Reveal className="flow__side" delay={0.1}>
            <p className="lead">
              One canonical format. A signed commit DAG. Branches that map to real environments. Every push is
              content-addressed by SHA-256, so identical state always hashes identically, with no noisy diffs and no blind overwrites.
            </p>
            <ul className="verbs">
              {verbs.map(([cmd, desc]) => (
                <li key={cmd}><code>{cmd}</code><span>{desc}</span></li>
              ))}
            </ul>
          </Reveal>
        </div>
        <Reveal className="canon">
          <p className="canon__label">canonical snapshot · sorted, UTF-8, one trailing newline</p>
          <pre className="canon__body">{`API_KEY=sk-abc123
DATABASE_URL=postgres://localhost/mydb
MULTILINE_CERT=b64:LS0tLS1CRUdJTi...`}
            <span className="canon__hash">sha256 9f2c4e…a17b</span>
          </pre>
        </Reveal>
      </section>

      {/* ---------- features ---------- */}
      <section className="band band--paper" id="features">
        <Reveal className="band__head">
          <span className="numeral numeral--ink">04</span>
          <h2 className="huge huge--ink">Everything a secret deserves.</h2>
        </Reveal>
        <div className="feats">
          {features.map((f, i) => (
            <Reveal as="article" className="feat" key={f.n} delay={(i % 2) * 0.06}>
              <div className="feat__top">
                <span className="feat__n">{f.n}</span>
                <h3>{f.title}</h3>
              </div>
              <p>{renderBody(f.body)}</p>
              <span className="feat__tag">{f.tag}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- governance ---------- */}
      <section className="band band--ink" id="govern">
        <Reveal className="band__head">
          <span className="numeral">05</span>
          <h2 className="huge">Promotion you can actually trust.</h2>
        </Reveal>
        <Reveal as="div">
          <p className="govern__lede">
            Authorization is evaluated in order: identity, membership, repo role, then branch policy. A write only
            lands when every gate agrees.
          </p>
        </Reveal>
        <ol className="pipe">
          {stages.map((s, i) => (
            <PipeStage key={s.name} stage={s} index={i} last={i === stages.length - 1} />
          ))}
        </ol>
      </section>

      {/* ---------- closer ---------- */}
      <section className="closer">
        <Koi className="koi koi--closer" />
        <h2 className="closer__line">Stop ignoring <span className="u">.env</span>.</h2>
        <p className="closer__sub">Encrypt it. Sign it. Branch it. Rotate it.</p>
        <pre className="closer__install">git clone https://github.com/ACM-VIT/wenvy</pre>
        <a className="btn btn--invert" href="https://github.com/ACM-VIT/wenvy" target="_blank" rel="noopener">
          read the design docs <span aria-hidden="true">→</span>
        </a>
      </section>

      <footer className="foot">
        <span className="foot__mark">wenvy</span>
        <span className="foot__team">Team LXVII · DevSpace 2026</span>
        <span className="foot__note">plaintext never leaves your device</span>
      </footer>
    </>
  )
}

function PipeStage({ stage, index, last }: { stage: typeof stages[number]; index: number; last: boolean }) {
  return (
    <>
      <Reveal as="li" className={`pipe__stage${stage.prod ? ' pipe__stage--prod' : ''}`} delay={index * 0.12}>
        <span className="pipe__name">{stage.name}</span>
        <span className="pipe__class">{stage.cls}</span>
        <p>{stage.body}</p>
      </Reveal>
      {!last && <li className="pipe__arrow" aria-hidden="true">→</li>}
    </>
  )
}

/** Wrap a single `code`-like token in the body string with a <code> element. */
function renderBody(body: string, code?: string) {
  const token = code ?? findCode(body)
  if (!token || !body.includes(token)) return body
  const [before, ...rest] = body.split(token)
  return <>{before}<code>{token}</code>{rest.join(token)}</>
}

function findCode(body: string) {
  const m = body.match(/\b(dev|staging|production|DATABASE_URL)\b/)
  return m?.[0]
}
