-- Prompt / version registry (owned by the model-router service).
-- Every LLM call references (prompt, version). Activate = rollback by activating
-- a prior version. At most one active version per prompt.
CREATE TABLE prompt (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text UNIQUE NOT NULL,                  -- stable handle, e.g. "hello.greeting"
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prompt_version (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id     uuid NOT NULL REFERENCES prompt(id),
  version       int  NOT NULL,
  template      text NOT NULL,                      -- Jinja2
  default_model text,
  is_active     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_id, version)
);

-- At most one active version per prompt.
CREATE UNIQUE INDEX uq_prompt_active ON prompt_version (prompt_id) WHERE is_active;
