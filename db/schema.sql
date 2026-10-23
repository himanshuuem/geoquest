CREATE TABLE IF NOT EXISTS countries (
  id         SERIAL PRIMARY KEY,
  code       CHAR(2)      NOT NULL UNIQUE,      -- ISO 3166-1 alpha-2, also used to build the flag emoji
  name       VARCHAR(80)  NOT NULL UNIQUE,
  capital    VARCHAR(80)  NOT NULL,
  continent  VARCHAR(20)  NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  id          SERIAL PRIMARY KEY,
  nickname    VARCHAR(20)  NOT NULL CHECK (char_length(trim(nickname)) BETWEEN 2 AND 20),
  mode        VARCHAR(10)  NOT NULL CHECK (mode IN ('capitals', 'flags')),
  streak      INTEGER      NOT NULL CHECK (streak >= 0),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scores_mode_streak_idx ON scores (mode, streak DESC, created_at);
