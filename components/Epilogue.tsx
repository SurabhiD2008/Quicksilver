import Sources from './Sources';

// "This part is real": the epilogue, verbatim from the permafrost research
// report. Its daylight veil and fade-in are driven by lib/client/epilogue.ts.
export default function Epilogue() {
  return (
    <section id="epilogue" className="epilogue">
      <EpilogueStory />
      <EpilogueHelps />
      <Sources />

      <a className="epilogue-reset-link" href="#top">
        ↑ Back to the surface
      </a>
    </section>
  );
}

// What the fiction left out: where the mercury is and where it goes.
export function EpilogueStory() {
  return (
    <>
      <span className="tag epilogue-tag">Epilogue · This part is real</span>
      <h2 className="epilogue-heading">
        The metal in this demo doesn&apos;t really come back together.
      </h2>

      <p className="epilogue-body">
        What you just scrolled through was fiction with good special effects. Real liquid metal
        doesn&apos;t relax into a calm, reunited whole after it fractures — once mercury gets loose
        in the world, it doesn&apos;t reform. It spreads, it bioaccumulates, and it stays.
      </p>

      <p className="epilogue-body">
        Underneath about a quarter of the Northern Hemisphere&apos;s land, permafrost has kept an
        old, dangerous stockpile frozen in place for thousands of years. Researchers estimate frozen
        Arctic ground holds roughly 1,656 gigagrams of mercury, counting both the permafrost and the
        seasonally-thawing layer above it — nearly twice as much as every ocean, soil, and the
        entire atmosphere combined.<sup>1</sup> It&apos;s been safe there, in the same sense a
        locked freezer is safe. Now the freezer is warming up.
      </p>

      <p className="epilogue-body">
        As permafrost thaws, that mercury isn&apos;t staying put. A 2024 study on Alaska&apos;s
        Yukon River found real, measurable mercury building up in riverbanks as the surrounding
        ground melted.<sup>2</sup> In the Canadian Arctic, researchers tracked record mercury
        releases from permafrost thaw slumps, with elevated concentrations detectable for kilometers
        downstream.<sup>3</sup> An estimated 200 tonnes of mercury already reach the Arctic Ocean
        every year, from a mix of sources that increasingly includes this ancient, thawing supply.
        <sup>4</sup>
      </p>

      <p className="epilogue-body">
        Mercury doesn&apos;t stay wherever it lands — it moves up food chains, concentrating as it
        climbs, until it reaches the fish, and the people, at the top. That mechanism isn&apos;t
        hypothetical: communities like Grassy Narrows First Nation in Canada, poisoned by an
        unrelated mercury spill decades ago, are still living with the health consequences today,
        generation after generation.<sup>5</sup> It&apos;s the same chemistry a warming Arctic is
        now testing at a much larger scale.
      </p>

      <p className="epilogue-body">
        There&apos;s no droplet animation for this part. The mercury that thaws out of the Arctic
        doesn&apos;t scroll back up and reassemble.
      </p>
    </>
  );
}

// What reduces the harm, and the sources for every claim.
export function EpilogueHelps() {
  return (
    <>
      <h3 className="epilogue-subheading">What actually helps</h3>

      <p className="epilogue-body">
        This isn&apos;t a fixed outcome. Researchers comparing low- and high-emissions futures found
        that under a low-emissions path, mercury in Alaska&apos;s Yukon River stays within safe
        fish-consumption guidelines even three centuries from now — but under a high-emissions path,
        the same river&apos;s fish exceed U.S. health guidelines by 2050.<sup>6</sup> The mercury
        already thawing out of the permafrost is already loose. How much more gets loose after this,
        and how fast, is still mostly a question of how much warming happens next.
      </p>

      <p className="epilogue-body">
        Nobody can manage a release they can&apos;t measure. A 2026 open database compiled more than
        100,000 mercury measurements from across the Northern Hemisphere&apos;s permafrost regions
        specifically so researchers and regulators can see where mercury is concentrated, track it
        over time, and flag where it&apos;s approaching internationally agreed limits.<sup>7</sup>{' '}
        Funding and expanding monitoring like this is unglamorous, but it&apos;s the difference
        between reacting to a crisis and catching it early.
      </p>

      <p className="epilogue-body">
        The mercury already thawing out of the ground can&apos;t be re-frozen, but the mercury still
        being added on top of it can be stopped. The Minamata Convention on Mercury — an
        international treaty now joined by roughly 150 countries — was built for exactly that:
        phasing out mercury in products, limiting industrial releases, and pushing gold-mining
        nations to draw up national plans to cut mercury use.<sup>8</sup> Every source it manages to
        close is one less thing compounding a problem the Arctic is already struggling with on its
        own.
      </p>

      <p className="epilogue-body epilogue-close">
        None of this needs a hero. It needs steady attention — support for the emissions path that
        keeps that Yukon River fork on the low side, continued funding for the researchers doing the
        measuring, and pressure on the governments and companies still dragging their feet on
        mercury sources the Minamata Convention already asked them to close.
      </p>
    </>
  );
}
