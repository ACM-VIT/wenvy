/* ============================================================
   wenvy landing — scroll reveals + terminal typing
   ============================================================ */

/* ---- staggered scroll reveals ---- */
(() => {
  const items = [...document.querySelectorAll('.reveal')];
  // stagger siblings inside ledgers / feature lists
  document.querySelectorAll('.ledger, .feats').forEach(group => {
    [...group.querySelectorAll('.reveal')].forEach((el, i) => {
      el.style.setProperty('--rd', (i * 0.07) + 's');
    });
  });

  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
})();

/* ---- terminal typing demo ---- */
(() => {
  const term = document.getElementById('term');
  if (!term) return;

  // each entry: [text, className, instant?]
  const script = [
    ['$ ', 'dim'], ['wenvy push ', 'p'], ['api-keys production\n', 'hl'],
    ['  resolving envelope chain  ssh → team → repo …\n', 'dim'],
    ['  canonicalizing ', ''], ['14 keys', 'hl'], ['  sha256 ', 'dim'], ['9f2c4e…a17b\n', 'p'],
    ['  sealing snapshot  ', ''], ['XChaCha20-Poly1305', 'hl'], ['  (repo key v3)\n', 'dim'],
    ['  streaming ciphertext → ', ''], ['ssh.wenvy.dev', 'p'], ['\n', ''],
    ['  branch policy  ', 'dim'], ['production', 'hl'], [': admin write · approval ✓\n', 'dim'],
    ['✓ ', 'ok'], ['production', 'hl'], [' ← commit ', ''], ['4e9a', 'p'],
    ['  signed ed25519 a1:b2:…\n', 'dim'],
    ['\n$ ', 'dim'], ['wenvy pull ', 'p'], ['api-keys dev\n', 'hl'],
    ['✓ ', 'ok'], ['decrypted locally — ', ''], ['plaintext never touched the server', 'hl'], ['\n', ''],
  ];

  const caret = document.createElement('span');
  caret.className = 'term__caret';

  let si = 0, ci = 0;
  function tick() {
    if (si >= script.length) {
      // pause, then restart
      setTimeout(() => { term.textContent = ''; si = 0; ci = 0; render(); tick(); }, 4200);
      return;
    }
    const [text, cls] = script[si];
    ci++;
    if (ci > text.length) { si++; ci = 0; render(); tick(); return; }
    render();
    // commands type slowly, output streams fast
    const fast = cls === 'dim' || cls === '' || cls === 'ok';
    const delay = fast ? 9 : 42;
    setTimeout(tick, delay + Math.random() * 18);
  }

  function render() {
    let html = '';
    for (let i = 0; i < si; i++) {
      const [t, c] = script[i];
      html += span(t, c);
    }
    if (si < script.length) {
      const [t, c] = script[si];
      html += span(t.slice(0, ci), c);
    }
    term.innerHTML = html;
    term.appendChild(caret);
    term.scrollTop = term.scrollHeight;
  }

  function span(t, c) {
    const safe = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return c ? `<span class="${c}">${safe}</span>` : safe;
  }

  // start when the terminal scrolls into view
  const start = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) { start.disconnect(); render(); tick(); }
  }, { threshold: 0.35 });
  start.observe(term);
})();

/* ---- masthead background fades in on scroll ---- */
(() => {
  const mast = document.querySelector('.mast');
  const onScroll = () => {
    mast.style.background = window.scrollY > 60
      ? 'var(--ink)'
      : 'linear-gradient(var(--vermillion), rgba(242,48,5,0))';
    mast.style.borderBottom = window.scrollY > 60 ? '1px solid var(--line-ink)' : 'none';
    mast.style.transition = 'background .3s';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
})();
