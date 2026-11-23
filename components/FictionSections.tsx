import type { ReactNode } from 'react';

// The four acts of the fiction. The drop behind them is driven by scroll
// position, so each section is a full viewport tall.

function Act({
  tag,
  lines,
  lead,
  first = false,
  children,
}: {
  tag: string;
  lines: [string, string];
  lead: string;
  first?: boolean;
  children?: ReactNode;
}) {
  const Heading = first ? 'h1' : 'h2';
  return (
    <section>
      <div className="copy">
        <p className="tag">{tag}</p>
        <Heading>
          {lines[0]}
          <br />
          {lines[1]}
        </Heading>
        <p className="lead">{lead}</p>
        {children}
      </div>
    </section>
  );
}

export default function FictionSections() {
  return (
    <>
      <Act
        first
        tag="00 · Solid State"
        lines={['Living', 'Metal']}
        lead="A drop of chrome, suspended and still. Bring your pointer close — it remembers the shape of your touch."
      >
        <span className="hint">
          <span className="pulse" />
          MOVE TO DISTURB THE SURFACE
        </span>
      </Act>
      <Act
        tag="01 · Molten"
        lines={['It forgets', 'its edges']}
        lead="Warmth loosens the hold. What was fixed begins to breathe, folding light through itself as the surface gives up its certainty."
      />
      <Act
        tag="02 · Fracture"
        lines={['Surface', 'tension fails']}
        lead="The bond can't hold the whole. The body lets go — scattering into restless droplets that circle the space it used to fill."
      />
      <Act
        tag="03 · Reformation"
        lines={['Back to', 'one']}
        lead="The pieces remember each other. They fall inward, settle, and press flat — a mirror-bright plaque that finally speaks its name."
      >
        <a className="link backtop" href="#top">
          ↑ RETURN TO SOLID STATE
        </a>
      </Act>
    </>
  );
}
