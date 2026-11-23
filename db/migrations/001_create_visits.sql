-- One row per page load. max_zone is the furthest narrative zone the visitor
-- reached: 0 Solid State, 1 Molten, 2 Fracture, 3 Reformation, 4 Epilogue.
-- Written with IF NOT EXISTS so it is safe on databases that already have the
-- table from earlier versions of the app.
CREATE TABLE IF NOT EXISTS visits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  max_zone    SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS visits_created_at_idx ON visits (created_at);
