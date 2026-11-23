-- Reject out-of-range zones at the database too, not only in the API.
ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_max_zone_range;

ALTER TABLE visits ADD CONSTRAINT visits_max_zone_range CHECK (max_zone BETWEEN 0 AND 4);

-- One counter row per UTC day. The visit insert claims a slot here in the same
-- statement, so the daily cap holds under concurrent requests.
CREATE TABLE IF NOT EXISTS daily_visit_counts (
  day     DATE PRIMARY KEY,
  visits  INTEGER NOT NULL CHECK (visits >= 0)
);
