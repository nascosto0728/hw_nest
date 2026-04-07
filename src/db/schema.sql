CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE boards (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Board',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE columns (
  id BIGSERIAL PRIMARY KEY,
  board_id BIGINT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL CHECK (position >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- DEFERRABLE INITIALLY DEFERRED: allows intermediate states during reordering
  -- within a transaction where positions may temporarily violate uniqueness
  -- (e.g., shift existing positions before inserting new one)
  CONSTRAINT columns_board_id_position_unique UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE tasks (
  id BIGSERIAL PRIMARY KEY,
  column_id BIGINT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "order" INT NOT NULL CHECK ("order" >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- DEFERRABLE INITIALLY DEFERRED: allows move/reorder operations within a single
  -- transaction without violating the unique constraint at each intermediate UPDATE step
  CONSTRAINT tasks_column_id_order_unique UNIQUE (column_id, "order") DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_columns_board_id ON columns(board_id);
CREATE INDEX idx_tasks_column_id_order ON tasks(column_id, "order");
