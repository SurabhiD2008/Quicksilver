'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';
import { attachEpilogueReveal } from '../lib/client/epilogue.ts';

/**
 * The fixed stage around the copy: WebGL canvas, vignette, epilogue veil,
 * wordmark, frosted bars, HUD, zone label, credit and custom cursor. When the
 * browser has no WebGL, or loses the context, the page shows a static
 * fallback drop and every word of the copy stays readable.
 */
/**
 * Mounts the scene into the holder, remounting it with a fresh canvas when a
 * lost WebGL context comes back.
 */
function useStage(holderRef: RefObject<HTMLDivElement | null>) {
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const fallback = () => document.body.classList.add('no-webgl');
    // Three.js loads after the page: the copy and the fixed layer paint first,
    // and the initial JavaScript stays small.
    import('../lib/scene/stage.ts').then(
      ({ mountStage }) => {
        if (cancelled) return;
        const stage = mountStage(holder, {
          onContextLost: fallback,
          onContextRestored: () => setGeneration((g) => g + 1),
        });
        if (!stage) {
          fallback();
          return;
        }
        document.body.classList.remove('no-webgl');
        dispose = stage.dispose;
      },
      () => {
        // The scene chunk could not load (offline, blocked): keep the page.
        if (!cancelled) fallback();
      },
    );
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [generation, holderRef]);
}

export default function MercuryScene() {
  const holderRef = useRef<HTMLDivElement>(null);
  useEffect(() => attachEpilogueReveal(document, window), []);
  useStage(holderRef);

  return (
    <>
      <div ref={holderRef} aria-hidden="true" />
      <div id="fallback-drop" aria-hidden="true" />
      <div id="vignette" aria-hidden="true" />
      <div id="epilogue-veil" aria-hidden="true" />
      <div id="wordmark-wrap" aria-hidden="true">
        <div id="wordmark">QUICKSILVER</div>
      </div>
      <div id="bar-top" className="chrome-bar" aria-hidden="true" />
      <div id="bar-bottom" className="chrome-bar" aria-hidden="true" />
      <div id="hud" aria-hidden="true">
        <div className="row">
          <span>SURFACE&nbsp;TENSION</span>
          <span className="val" id="tension">
            100%
          </span>
        </div>
        <div className="bar">
          <i id="tensionBar" />
        </div>
      </div>
      <div id="zone" aria-hidden="true">
        SOLID&nbsp;STATE
      </div>
      <div id="credit">Created by Surabhi Datta</div>
      <div id="cursor" aria-hidden="true" />
    </>
  );
}
