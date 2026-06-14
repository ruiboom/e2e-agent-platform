-- Project / workspace — the root of the lineage golden thread.
CREATE TABLE project (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text UNIQUE NOT NULL,
  name       text NOT NULL,
  domain     text,
  owner      text NOT NULL,
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
