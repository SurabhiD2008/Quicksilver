import Analytics from '../components/Analytics';
import Epilogue from '../components/Epilogue';
import FictionSections from '../components/FictionSections';
import MercuryScene from '../components/MercuryScene';
import SceneBoundary from '../components/SceneBoundary';
import { getConfig } from '../lib/server/config.ts';

// The four fiction sections, then the epilogue: its copy is verbatim from the
// permafrost research report, with numbered references to the sources below.
export default function Page() {
  const { analyticsEnabled } = getConfig();
  return (
    <>
      {/* Target of the back-to-top links. */}
      <span id="top" />
      <SceneBoundary>
        <MercuryScene />
      </SceneBoundary>
      <Analytics enabled={analyticsEnabled} />

      <main>
        <FictionSections />
        <Epilogue />
      </main>
    </>
  );
}
