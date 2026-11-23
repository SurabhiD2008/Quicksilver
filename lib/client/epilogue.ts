// The epilogue's daylight veil and text reveal. Runs on its own scroll maths,
// decoupled from the drop's timeline, and does not need WebGL: the copy must
// be readable even when the scene cannot start.

export function attachEpilogueReveal(doc: Document, win: Window): () => void {
  const section = doc.getElementById('epilogue');
  const veil = doc.getElementById('epilogue-veil');
  if (!section || !veil) return () => undefined;
  const fadeEls = Array.from(
    doc.querySelectorAll<HTMLElement>(
      '.epilogue-tag, .epilogue-heading, .epilogue-subheading, .epilogue-body, .epilogue-sources, .epilogue-reset-link',
    ),
  );

  const update = () => {
    // The veil must finish before the copy is in reading position, and must
    // not start until the wordmark reveal has had its moment.
    const top = section.offsetTop;
    const start = top - win.innerHeight * 0.62;
    const end = top - win.innerHeight * 0.3;
    const t = Math.min(Math.max((win.scrollY - start) / (end - start), 0), 1);
    veil.style.opacity = String(t);
    // The fiction sections' dark scrims sit above the veil; fade them out early
    // so they never show as a dark box on the daylight.
    doc.documentElement.style.setProperty('--scrim-fade', String(Math.max(0, 1 - t / 0.3)));
    doc.body.classList.toggle('is-daylight', t > 0.55);
    doc.body.classList.toggle('daylight-full', t >= 1);
    const textT = Math.min(Math.max((t - 0.35) / 0.55, 0), 1);
    for (const el of fadeEls) {
      el.style.opacity = String(textT);
      el.style.transform = `translateY(${16 * (1 - textT)}px)`;
    }
  };

  doc.body.classList.add('reveal-ready');
  win.addEventListener('scroll', update, { passive: true });
  win.addEventListener('resize', update);
  update();
  // Turn the fades on only after the first state is painted, so the copy never
  // animates out of its no-script daylight into the dark stage.
  let frame = win.requestAnimationFrame(() => {
    frame = win.requestAnimationFrame(() => doc.body.classList.add('reveal-animate'));
  });
  return () => {
    win.cancelAnimationFrame(frame);
    win.removeEventListener('scroll', update);
    win.removeEventListener('resize', update);
    doc.body.classList.remove('reveal-ready', 'reveal-animate', 'is-daylight', 'daylight-full');
  };
}
