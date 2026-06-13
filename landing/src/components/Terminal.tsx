import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

type Seg = readonly [string, string]

// [text, className]  ·  className '' renders as plain text
const SCRIPT: Seg[] = [
  ['$ ', 'dim'], ['wenvy push ', 'p'], ['api-keys production\n', 'hl'],
  ['  resolving envelope chain  ssh → team → repo …\n', 'dim'],
  ['  canonicalizing ', ''], ['14 keys', 'hl'], ['  sha256 ', 'dim'], ['9f2c4e…a17b\n', 'p'],
  ['  sealing snapshot  ', ''], ['XChaCha20-Poly1305', 'hl'], ['  (repo key v3)\n', 'dim'],
  ['  streaming ciphertext → ', ''], ['ssh.wenvy.dev', 'p'], ['\n', ''],
  ['  branch policy  ', 'dim'], ['production', 'hl'], [': admin write · approval ✓\n', 'dim'],
  ['✓ ', 'ok'], ['production', 'hl'], [' ← commit ', ''], ['4e9a', 'p'],
  ['  signed ed25519 a1:b2:…\n', 'dim'],
  ['\n$ ', 'dim'], ['wenvy pull ', 'p'], ['api-keys dev\n', 'hl'],
  ['✓ ', 'ok'], ['decrypted locally · ', ''], ['plaintext never touched the server', 'hl'], ['\n', ''],
]

export function Terminal() {
  const host = useRef<HTMLDivElement>(null)
  const inView = useInView(host, { once: true, amount: 0.35 })
  const [{ si, ci }, setPos] = useState({ si: 0, ci: 0 })

  useEffect(() => {
    if (!inView) return
    let timer: ReturnType<typeof setTimeout>
    let alive = true

    function step(si: number, ci: number) {
      if (!alive) return
      if (si >= SCRIPT.length) {
        timer = setTimeout(() => { setPos({ si: 0, ci: 0 }); step(0, 0) }, 4200)
        return
      }
      const [text, cls] = SCRIPT[si]
      const nextCi = ci + 1
      if (nextCi > text.length) {
        setPos({ si: si + 1, ci: 0 })
        step(si + 1, 0)
        return
      }
      setPos({ si, ci: nextCi })
      const fast = cls === 'dim' || cls === '' || cls === 'ok'
      timer = setTimeout(() => step(si, nextCi), (fast ? 9 : 42) + Math.random() * 18)
    }

    step(0, 0)
    return () => { alive = false; clearTimeout(timer) }
  }, [inView])

  const segs: Seg[] = []
  for (let i = 0; i < si; i++) segs.push(SCRIPT[i])
  if (si < SCRIPT.length) {
    const [t, c] = SCRIPT[si]
    segs.push([t.slice(0, ci), c])
  }

  return (
    <div className="term" ref={host} role="img" aria-label="Terminal demonstration of wenvy push">
      <div className="term__bar"><span /><span /><span /><b>ssh.wenvy.dev</b></div>
      <pre className="term__body">
        {segs.map(([t, c], i) => (c ? <span key={i} className={c}>{t}</span> : <span key={i}>{t}</span>))}
        <span className="term__caret" />
      </pre>
    </div>
  )
}
