import { useEffect, useState } from 'react'
import { Logo } from './Logo'

const LINKS: [string, string][] = [
  ['#problem', 'the problem'],
  ['#model', 'the model'],
  ['#flow', 'workflow'],
  ['#features', 'capabilities'],
  ['#govern', 'governance'],
]

export function Masthead() {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string>('')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // scroll-spy: highlight the section currently in view
  useEffect(() => {
    const sections = LINKS
      .map(([href]) => document.getElementById(href.slice(1)))
      .filter((el): el is HTMLElement => !!el)

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive('#' + visible.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.25, 0.5] },
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
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
        <Logo className="mast__logo" />wenvy
      </a>
      <nav className="mast__nav" aria-label="Primary">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} className={active === href ? 'is-active' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <a className="mast__cta" href="https://github.com/ACM-VIT/wenvy" target="_blank" rel="noopener">
        <span className="dot" />source
      </a>
    </header>
  )
}
