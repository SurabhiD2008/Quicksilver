import MercuryScene from '../components/MercuryScene';
import Analytics from '../components/Analytics';

// The four fiction sections are a verbatim port of the original build; the fifth
// (Epilogue) copy is verbatim from permafrost-integration-report.md. Only the
// tag class was adapted to this build's `.tag`.
export default function Page() {
  return (
    <>
      {/* Anchor target for the "back to top" links — at the top of the flow so
          "return to the surface" scrolls up (the original had it at the bottom). */}
      <span id="top" />

      {/* Fixed WebGL stage + HUD + wordmark + credit + cursor, and the scene. */}
      <MercuryScene />

      {/* Records the visit + how far the reader scrolls (renders nothing). */}
      <Analytics />

      <main>
        <section>
          <p className="tag">00 · Solid State</p>
          <h1>Living<br />Metal</h1>
          <p className="lead">
            A drop of chrome, suspended and still. Bring your pointer close —
            it remembers the shape of your touch.
          </p>
          <span className="hint"><span className="pulse" />MOVE TO DISTURB THE SURFACE</span>
        </section>

        <section>
          <p className="tag">01 · Molten</p>
          <h2>It forgets<br />its edges</h2>
          <p className="lead">
            Warmth loosens the hold. What was fixed begins to breathe, folding light
            through itself as the surface gives up its certainty.
          </p>
        </section>

        <section>
          <p className="tag">02 · Fracture</p>
          <h2>Surface<br />tension fails</h2>
          <p className="lead">
            The bond can&apos;t hold the whole. The body lets go — scattering into
            restless droplets that circle the space it used to fill.
          </p>
        </section>

        <section>
          <p className="tag">03 · Reformation</p>
          <h2>Back to<br />one</h2>
          <p className="lead">
            The pieces remember each other. They fall inward, settle, and press flat —
            a mirror-bright plaque that finally speaks its name.
          </p>
          <a className="link backtop" href="#top" id="backtop">↑ RETURN TO SOLID STATE</a>
        </section>

        {/* ── Epilogue: verbatim copy from the report ── */}
        <section id="epilogue" className="epilogue">
          <span className="tag epilogue-tag">Epilogue · This part is real</span>
          <h2 className="epilogue-heading">The metal in this demo doesn&apos;t really come back together.</h2>

          <p className="epilogue-body">What you just scrolled through was fiction with good special effects. Real liquid metal doesn&apos;t relax into a calm, reunited whole after it fractures — once mercury gets loose in the world, it doesn&apos;t reform. It spreads, it bioaccumulates, and it stays.</p>

          <p className="epilogue-body">Underneath about a quarter of the Northern Hemisphere&apos;s land, permafrost has kept an old, dangerous stockpile frozen in place for thousands of years. Researchers estimate frozen Arctic ground holds roughly 1,656 gigagrams of mercury, counting both the permafrost and the seasonally-thawing layer above it — nearly twice as much as every ocean, soil, and the entire atmosphere combined.<sup>1</sup> It&apos;s been safe there, in the same sense a locked freezer is safe. Now the freezer is warming up.</p>

          <p className="epilogue-body">As permafrost thaws, that mercury isn&apos;t staying put. A 2024 study on Alaska&apos;s Yukon River found real, measurable mercury building up in riverbanks as the surrounding ground melted.<sup>2</sup> In the Canadian Arctic, researchers tracked record mercury releases from permafrost thaw slumps, with elevated concentrations detectable for kilometers downstream.<sup>3</sup> An estimated 200 tonnes of mercury already reach the Arctic Ocean every year, from a mix of sources that increasingly includes this ancient, thawing supply.<sup>4</sup></p>

          <p className="epilogue-body">Mercury doesn&apos;t stay wherever it lands — it moves up food chains, concentrating as it climbs, until it reaches the fish, and the people, at the top. That mechanism isn&apos;t hypothetical: communities like Grassy Narrows First Nation in Canada, poisoned by an unrelated mercury spill decades ago, are still living with the health consequences today, generation after generation.<sup>5</sup> It&apos;s the same chemistry a warming Arctic is now testing at a much larger scale.</p>

          <p className="epilogue-body">There&apos;s no droplet animation for this part. The mercury that thaws out of the Arctic doesn&apos;t scroll back up and reassemble.</p>

          <h3 className="epilogue-subheading">What actually helps</h3>

          <p className="epilogue-body">This isn&apos;t a fixed outcome. Researchers comparing low- and high-emissions futures found that under a low-emissions path, mercury in Alaska&apos;s Yukon River stays within safe fish-consumption guidelines even three centuries from now — but under a high-emissions path, the same river&apos;s fish exceed U.S. health guidelines by 2050.<sup>6</sup> The mercury already thawing out of the permafrost is already loose. How much more gets loose after this, and how fast, is still mostly a question of how much warming happens next.</p>

          <p className="epilogue-body">Nobody can manage a release they can&apos;t measure. A 2026 open database compiled more than 100,000 mercury measurements from across the Northern Hemisphere&apos;s permafrost regions specifically so researchers and regulators can see where mercury is concentrated, track it over time, and flag where it&apos;s approaching internationally agreed limits.<sup>7</sup> Funding and expanding monitoring like this is unglamorous, but it&apos;s the difference between reacting to a crisis and catching it early.</p>

          <p className="epilogue-body">The mercury already thawing out of the ground can&apos;t be re-frozen, but the mercury still being added on top of it can be stopped. The Minamata Convention on Mercury — an international treaty now joined by roughly 150 countries — was built for exactly that: phasing out mercury in products, limiting industrial releases, and pushing gold-mining nations to draw up national plans to cut mercury use.<sup>8</sup> Every source it manages to close is one less thing compounding a problem the Arctic is already struggling with on its own.</p>

          <p className="epilogue-body epilogue-close">None of this needs a hero. It needs steady attention — support for the emissions path that keeps that Yukon River fork on the low side, continued funding for the researchers doing the measuring, and pressure on the governments and companies still dragging their feet on mercury sources the Minamata Convention already asked them to close.</p>

          <div className="epilogue-sources">
            <p className="epilogue-sources-title">Sources</p>
            <ol>
              <li>Schuster et al., <em>Geophysical Research Letters</em>, via Scientific American — <a href="https://www.scientificamerican.com/article/the-arctic-permafrost-holds-a-crazy-amount-of-mercury-mdash-and-thats-bad-news/" target="_blank" rel="noopener">&quot;The Arctic Permafrost Holds a Crazy Amount of Mercury&quot;</a></li>
              <li>High Country News — <a href="https://www.hcn.org/articles/alaskas-permafrost-is-thawing-releasing-a-concerning-amount-of-mercury/" target="_blank" rel="noopener">&quot;Alaska&apos;s permafrost is thawing, releasing a concerning amount of mercury&quot;</a></li>
              <li>University of Alberta, via ScienceDaily — <a href="https://www.sciencedaily.com/releases/2018/12/181212134416.htm" target="_blank" rel="noopener">&quot;Record levels of mercury released by thawing permafrost in Canadian Arctic&quot;</a></li>
              <li>AMAP / Nature Reviews, via CBC News — <a href="https://amp.cbc.ca/news/canada/north/permafrost-mercury-arctic-ocean-1.6475185" target="_blank" rel="noopener">&quot;Significant amounts of mercury in permafrost threatens Arctic food supply&quot;</a></li>
              <li>Raven Trust — <a href="https://raventrust.com/campaigns/grassy-narrows/" target="_blank" rel="noopener">Grassy Narrows mercury justice campaign</a></li>
              <li>Schaefer et al., <em>Nature Communications</em> — <a href="https://www.nature.com/articles/s41467-020-18398-5" target="_blank" rel="noopener">&quot;Potential impacts of mercury released from thawing permafrost&quot;</a></li>
              <li>PermHg Database, <em>Earth System Science Data</em> — <a href="https://essd.copernicus.org/articles/18/4509/2026/" target="_blank" rel="noopener">&quot;A consolidated database of mercury observations for permafrost regions&quot;</a></li>
              <li>US EPA — <a href="https://www.epa.gov/international-cooperation/minamata-convention-mercury" target="_blank" rel="noopener">Minamata Convention on Mercury overview</a></li>
            </ol>
            <p className="epilogue-learn-more">Learn more: <a href="https://www.mercuryconvention.org/" target="_blank" rel="noopener">Minamata Convention on Mercury</a> · <a href="https://www.unep.org/globalmercurypartnership/" target="_blank" rel="noopener">UNEP Global Mercury Partnership</a></p>
          </div>

          <a className="epilogue-reset-link" href="#top">↑ Back to the surface</a>
        </section>
      </main>
    </>
  );
}
