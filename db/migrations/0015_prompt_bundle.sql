-- Prompt drafts + versioned prompt-set bundles (owned by the model-router).
--
-- Governance model:
--   * prompt_draft — at most ONE working draft per prompt. A draft takes effect
--     immediately for live routing (the whole console is the test UI) but is
--     not durable until approved.
--   * prompt_bundle — approval snapshots the COMPLETE prompt set (every
--     prompt's active template) as one immutable bundle version. Prompts are
--     never versioned individually from the admin surface — full bundle every
--     version, so no prompt ever deviates on its own.
CREATE TABLE prompt_draft (
  prompt_id  uuid PRIMARY KEY REFERENCES prompt(id),
  template   text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prompt_bundle (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version      int  UNIQUE NOT NULL,
  prompts      jsonb NOT NULL,          -- { key: {version, template, default_model} } — the full set
  prompt_count int  NOT NULL,
  approved_by  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
