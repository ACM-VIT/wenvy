import { useEffect, useState } from 'react'

const LINKS: [string, string][] = [
  ['#problem', 'the problem'],
  ['#model', 'the model'],
  ['#flow', 'workflow'],
  ['#features', 'capabilities'],
  ['#govern', 'governance'],
]

export function Masthead() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className="mast"
      id="top"
      style={{
        background: scrolled ? 'var(--ink)' : 'linear-gradient(var(--vermillion), rgba(242,48,5,0))',
        borderBottom: scrolled ? '1px solid var(--line-ink)' : 'none',
        transition: 'background .3s',
      }}
    >
      <a className="mast__mark" href="#top" aria-label="Wenvy home">
        <span className="seal">家</span> wenvy
      </a>
      <nav className="mast__nav" aria-label="Primary">
        {LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <a className="mast__cta" href="https://github.com/ACM-VIT/wenvy" target="_blank" rel="noopener">
        <span className="dot" />source
      </a>
    </header>
  )
}
