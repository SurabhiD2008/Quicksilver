import type { ReactNode } from 'react';

// Numbered references for the epilogue's claims, in citation order.
interface Source {
  credit: ReactNode;
  href: string;
  title: string;
  quoted: boolean;
}

const SOURCES: Source[] = [
  {
    credit: (
      <>
        Schuster et al., <em>Geophysical Research Letters</em>, via Scientific American
      </>
    ),
    href: 'https://www.scientificamerican.com/article/the-arctic-permafrost-holds-a-crazy-amount-of-mercury-mdash-and-thats-bad-news/',
    title: 'The Arctic Permafrost Holds a Crazy Amount of Mercury',
    quoted: true,
  },
  {
    credit: 'High Country News',
    href: 'https://www.hcn.org/articles/alaskas-permafrost-is-thawing-releasing-a-concerning-amount-of-mercury/',
    title: "Alaska's permafrost is thawing, releasing a concerning amount of mercury",
    quoted: true,
  },
  {
    credit: 'University of Alberta, via ScienceDaily',
    href: 'https://www.sciencedaily.com/releases/2018/12/181212134416.htm',
    title: 'Record levels of mercury released by thawing permafrost in Canadian Arctic',
    quoted: true,
  },
  {
    credit: 'AMAP / Nature Reviews, via CBC News',
    href: 'https://amp.cbc.ca/news/canada/north/permafrost-mercury-arctic-ocean-1.6475185',
    title: 'Significant amounts of mercury in permafrost threatens Arctic food supply',
    quoted: true,
  },
  {
    credit: 'Raven Trust',
    href: 'https://raventrust.com/campaigns/grassy-narrows/',
    title: 'Grassy Narrows mercury justice campaign',
    quoted: false,
  },
  {
    credit: (
      <>
        Schaefer et al., <em>Nature Communications</em>
      </>
    ),
    href: 'https://www.nature.com/articles/s41467-020-18398-5',
    title: 'Potential impacts of mercury released from thawing permafrost',
    quoted: true,
  },
  {
    credit: (
      <>
        PermHg Database, <em>Earth System Science Data</em>
      </>
    ),
    href: 'https://essd.copernicus.org/articles/18/4509/2026/',
    title: 'A consolidated database of mercury observations for permafrost regions',
    quoted: true,
  },
  {
    credit: 'US EPA',
    href: 'https://www.epa.gov/international-cooperation/minamata-convention-mercury',
    title: 'Minamata Convention on Mercury overview',
    quoted: false,
  },
];

export default function Sources() {
  return (
    <div className="epilogue-sources">
      <p className="epilogue-sources-title">Sources</p>
      <ol>
        {SOURCES.map((source) => (
          <li key={source.href}>
            {source.credit} —{' '}
            <a href={source.href} target="_blank" rel="noopener">
              {source.quoted ? `"${source.title}"` : source.title}
            </a>
          </li>
        ))}
      </ol>
      <p className="epilogue-learn-more">
        Learn more:{' '}
        <a href="https://www.mercuryconvention.org/" target="_blank" rel="noopener">
          Minamata Convention on Mercury
        </a>{' '}
        ·{' '}
        <a href="https://www.unep.org/globalmercurypartnership/" target="_blank" rel="noopener">
          UNEP Global Mercury Partnership
        </a>
      </p>
    </div>
  );
}
