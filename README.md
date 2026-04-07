# Kanban Backend API

A RESTful API for a Kanban task management system built with TypeScript, Express, and PostgreSQL.

## Tech Stack

- **Language:** TypeScript
- **Framework:** Express
- **Database:** PostgreSQL (via `pg` / node-postgres, no ORM)
- **Auth:** JWT (jsonwebtoken) + bcrypt
- **Architecture:** controller → service → repository

## Setup

### 1. Prerequisites

- Node.js ≥ 18
- PostgreSQL ≥ 14

### 2. Install Dependencies

```bash
cd Kanban_backend
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your actual DB credentials and JWT secret
```

### 4. Initialize Database

```bash
psql -U your_user -d kanban -f src/db/schema.sql
```

Or connect and run the SQL manually:

```sql
\i src/db/schema.sql
```

### 5. Run Development Server

```bash
npm run dev
```

### 6. Build & Run Production

```bash
npm run build
npm start
```

## API Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/register | Register new user |
| POST | /auth/login | Login, returns JWT |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| POST | /projects | Create project (auto-creates Default Board) |
| GET | /projects | List user's projects |

### Boards

| Method | Path | Description |
|--------|------|-------------|
| GET | /boards/:id | Get board with nested columns and tasks |

### Columns

| Method | Path | Description |
|--------|------|-------------|
| POST | /columns | Create column in a board |
| PUT | /columns/:id | Update column name |
| DELETE | /columns/:id | Delete column (fails if tasks exist) |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| POST | /tasks | Create task in a column |
| GET | /tasks?boardId=... | Get tasks grouped by column |
| PUT | /tasks/:id | Update task title/description |
| DELETE | /tasks/:id | Delete task |
| PATCH | /tasks/:id/move | Move task within or across columns |

## Authentication

All endpoints except `/auth/register` and `/auth/login` require a JWT token:

```
Authorization: Bearer <token>
```

## Error Response Format

All errors follow this format:

```json
{ "error": "Error message here" }
```

Status codes: `400` / `401` / `403` / `404` / `500`

## PATCH /tasks/:id/move

Request body:
```json
{
  "toColumnId": 2,
  "newOrder": 3
}
```

Response:
```json
{
  "id": 5,
  "columnId": 2,
  "order": 3
}
```

The move operation runs inside a PostgreSQL transaction with row-level locking (`SELECT ... FOR UPDATE`) to prevent race conditions.

### Move Logic

**Same column:**
- Moving down (newOrder > oldOrder): tasks in `(oldOrder, newOrder]` shift up (-1)
- Moving up (newOrder < oldOrder): tasks in `[newOrder, oldOrder)` shift down (+1)

**Cross-column:**
1. Source column: tasks with `order > oldOrder` shift down (-1)
2. Target column: tasks with `order >= newOrder` shift up (+1)
3. Task itself: updated with new `column_id` and `order`

**Clamping & Validation:**
- `newOrder` must be `>= 1`, otherwise returns `400 Bad Request`.
- Same column: upper bound is clamped to `task_count`
- Cross-column: upper bound is clamped to `(target_count + 1)`

