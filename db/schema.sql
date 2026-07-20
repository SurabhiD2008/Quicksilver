-- Quicksilver analytics schema
--
-- One row per page load. `max_zone` records how far the visitor scrolled
-- through the narrative (0 = Solid State … 4 = Epilogue). It's a passive,
-- privacy-light record: no personal data, no user-generated content.
--
-- The app also creates this table lazily at runtime (see lib/db.js →
-- ensureSchema), so running this file by hand is optional — but it's here as
-- the canonical source of truth and for manual/CI provisioning.

CREATE TABLE IF NOT EXISTS visits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 0 Solid State · 1 Molten · 2 Fracture · 3 Reformation · 4 Epilogue
  max_zone    SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS visits_created_at_idx ON visits (created_at);
