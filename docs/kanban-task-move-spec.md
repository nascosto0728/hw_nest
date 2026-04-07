# Kanban 任務拖曳排序實作規格（Backend）

## 1. 範圍
本文件只定義核心功能：`PATCH /tasks/:id/move`（同欄位排序 + 跨欄位移動），含 SQL 與交易一致性規則。

---

## 2. 資料模型（建議 PostgreSQL）

```sql
-- users
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- projects
CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- boards
CREATE TABLE boards (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Board',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- columns
CREATE TABLE columns (
  id BIGSERIAL PRIMARY KEY,
  board_id BIGINT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL CHECK (position >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, position)
);

-- tasks
CREATE TABLE tasks (
  id BIGSERIAL PRIMARY KEY,
  column_id BIGINT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "order" INT NOT NULL CHECK ("order" >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (column_id, "order")
);

CREATE INDEX idx_columns_board_id ON columns(board_id);
CREATE INDEX idx_tasks_column_id_order ON tasks(column_id, "order");
```

---

## 3. API 定義

### `PATCH /tasks/:id/move`

Request:
```json
{
  "toColumnId": 123,
  "newOrder": 2
}
```

Response `200`:
```json
{
  "id": 99,
  "columnId": 123,
  "order": 2
}
```

---

## 4. 驗證與授權

1. 驗證 JWT，否則 `401`.
2. 載入 task + source column + source board + project owner，若不存在 `404`.
3. 驗證該 project 屬於當前 user，不符 `403`.
4. 載入 `toColumnId`，若不存在 `404`.
5. 驗證 source board 與 target board 相同（若你不允許跨 board），不符 `400`.
6. 驗證 `newOrder >= 1`，否則 `400`.

---

## 5. 移動規則（核心）

### 情境 A：同欄位移動（`fromColumnId == toColumnId`）

- 若 `newOrder == oldOrder`：直接回傳，不更新。
- 先把 `newOrder` 夾到合法範圍：`1..task_count`
- `newOrder > oldOrder`：
  - 區間 `(oldOrder, newOrder]` 的 task，`order = order - 1`
- `newOrder < oldOrder`：
  - 區間 `[newOrder, oldOrder)` 的 task，`order = order + 1`
- 最後把目前 task 更新為 `newOrder`

### 情境 B：跨欄位移動（`fromColumnId != toColumnId`）

- 目標欄位合法範圍：`1..(target_count + 1)`（可插到最後）
- 原欄位：
  - `order > oldOrder` 的 task，`order = order - 1`
- 新欄位：
  - `order >= newOrder` 的 task，`order = order + 1`
- 最後更新 task：
  - `column_id = toColumnId`
  - `order = newOrder`

---

## 6. 交易與鎖（避免 order 衝突）

必須在**單一 transaction**中完成，並鎖定相關資料列。

### 建議鎖定順序
1. task row (`FOR UPDATE`)
2. source column row (`FOR UPDATE`)
3. target column row（若不同欄位，`FOR UPDATE`）
4. 受影響 task 集合（透過 UPDATE 自然加 row lock）

固定鎖順序可降低死鎖機率。

---

## 7. SQL 範例（可直接套用）

### 7.1 同欄位：往後移（`newOrder > oldOrder`）
```sql
BEGIN;

-- 1) 鎖 task 並取得 oldOrder / column_id
SELECT id, column_id, "order"
FROM tasks
WHERE id = $1
FOR UPDATE;

-- 2) 移動區間 -1
UPDATE tasks
SET "order" = "order" - 1,
    updated_at = NOW()
WHERE column_id = $2
  AND "order" > $3
  AND "order" <= $4;

-- 3) 更新自己
UPDATE tasks
SET "order" = $4,
    updated_at = NOW()
WHERE id = $1;

COMMIT;
```

### 7.2 同欄位：往前移（`newOrder < oldOrder`）
```sql
BEGIN;

SELECT id, column_id, "order"
FROM tasks
WHERE id = $1
FOR UPDATE;

UPDATE tasks
SET "order" = "order" + 1,
    updated_at = NOW()
WHERE column_id = $2
  AND "order" >= $4
  AND "order" < $3;

UPDATE tasks
SET "order" = $4,
    updated_at = NOW()
WHERE id = $1;

COMMIT;
```

### 7.3 跨欄位移動
```sql
BEGIN;

-- 1) 鎖住 task
SELECT id, column_id, "order"
FROM tasks
WHERE id = $1
FOR UPDATE;

-- 2) source 欄位尾部補位（-1）
UPDATE tasks
SET "order" = "order" - 1,
    updated_at = NOW()
WHERE column_id = $2
  AND "order" > $3;

-- 3) target 欄位騰位（+1）
UPDATE tasks
SET "order" = "order" + 1,
    updated_at = NOW()
WHERE column_id = $4
  AND "order" >= $5;

-- 4) task 換欄 + 新排序
UPDATE tasks
SET column_id = $4,
    "order" = $5,
    updated_at = NOW()
WHERE id = $1;

COMMIT;
```

---

## 8. Service 偽碼（TypeScript）

```ts
async function moveTask(userId: number, taskId: number, toColumnId: number, newOrder: number) {
  if (newOrder < 1) throw badRequest("newOrder must be >= 1");

  return db.tx(async (trx) => {
    const task = await repo.lockTaskById(trx, taskId); // FOR UPDATE
    if (!task) throw notFound("Task not found");

    const source = await repo.getColumnWithProjectOwner(trx, task.columnId);
    if (!source) throw notFound("Column not found");
    if (source.ownerId !== userId) throw forbidden("No permission");

    const target = await repo.getColumnWithProjectOwner(trx, toColumnId);
    if (!target) throw notFound("Target column not found");
    if (target.ownerId !== userId) throw forbidden("No permission");
    if (source.boardId !== target.boardId) throw badRequest("Cross-board move not allowed");

    const oldOrder = task.order;
    const fromColumnId = task.columnId;

    if (fromColumnId === toColumnId) {
      const count = await repo.countTasksInColumn(trx, fromColumnId);
      const clamped = clamp(newOrder, 1, count);
      if (clamped === oldOrder) return { id: taskId, columnId: fromColumnId, order: oldOrder };

      if (clamped > oldOrder) {
        await repo.shiftDownInRange(trx, fromColumnId, oldOrder + 1, clamped); // -1
      } else {
        await repo.shiftUpInRange(trx, fromColumnId, clamped, oldOrder - 1); // +1
      }

      await repo.updateTaskOrder(trx, taskId, clamped);
      return { id: taskId, columnId: fromColumnId, order: clamped };
    }

    const targetCount = await repo.countTasksInColumn(trx, toColumnId);
    const clamped = clamp(newOrder, 1, targetCount + 1);

    await repo.compactSourceColumnAfter(trx, fromColumnId, oldOrder); // > oldOrder => -1
    await repo.openGapInTargetColumnAt(trx, toColumnId, clamped);     // >= clamped => +1
    await repo.moveTaskToColumnAndOrder(trx, taskId, toColumnId, clamped);

    return { id: taskId, columnId: toColumnId, order: clamped };
  });
}
```

---

## 9. Repository SQL 片段（對應上面偽碼）

```sql
-- shiftDownInRange: [left, right] -1
UPDATE tasks
SET "order" = "order" - 1, updated_at = NOW()
WHERE column_id = $1
  AND "order" BETWEEN $2 AND $3;

-- shiftUpInRange: [left, right] +1
UPDATE tasks
SET "order" = "order" + 1, updated_at = NOW()
WHERE column_id = $1
  AND "order" BETWEEN $2 AND $3;

-- compactSourceColumnAfter: (oldOrder, +inf) -1
UPDATE tasks
SET "order" = "order" - 1, updated_at = NOW()
WHERE column_id = $1
  AND "order" > $2;

-- openGapInTargetColumnAt: [newOrder, +inf) +1
UPDATE tasks
SET "order" = "order" + 1, updated_at = NOW()
WHERE column_id = $1
  AND "order" >= $2;
```

---

## 10. 錯誤回應格式

```json
{ "error": "Task not found" }
```

狀態碼：
- `400` 參數錯誤 / 非法移動
- `401` 未登入
- `403` 無權限
- `404` 資料不存在
- `500` 未預期錯誤

---

## 11. 測試案例（最少）

1. 同欄位 `3 -> 1`，中間任務全部 `+1`
2. 同欄位 `1 -> 4`，中間任務全部 `-1`
3. 跨欄位移動，source 補位、target 騰位都正確
4. 移到最後（`newOrder = 大於 count`）可自動夾值
5. 權限測試：他人 project 的 task 應 `403`
6. 競態測試：兩個請求同時移動，不可出現重複 order
7. 刪除 task 後，order 必須連續

