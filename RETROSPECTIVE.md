# Kanban Backend — 開發回顧

> 日期：2026-03-28
> 範圍：從零建構 Kanban Backend API，完成 25 個測試案例全數通過

---

## Bug 1：Test Script — ID 解析失敗

### 問題
Test script 使用 `grep -o '"id":[0-9]*'` 來從 API response 中擷取 ID，但實際 response 的 ID 是字串格式（`"id":"2"`），而非數字格式（`"id":2`），導致所有需要帶入 ID 的後續 curl 指令變成空值。

**症狀：**
- `POST /columns` → `{"error":"Unexpected token ',', ...\"boardId\":,\"name\":...`
- `PUT /columns/:id` → `Cannot PUT /columns/`（ID 為空）
- `PATCH /tasks/:id/move` → 全部 JSON parse error

### 原因
PostgreSQL 的 BIGSERIAL 型別在 node-postgres 回傳時預設是字串，而非 JavaScript number。

### 解法
改用 `python3` 解析 JSON 取值：
```bash
jget() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$2)" 2>/dev/null; }
ID=$(jget "$RESPONSE" "['id']")
```
同時將 curl body 改用雙引號 + 變數展開，確保 JSON 合法：
```bash
# 錯誤
-d '{"boardId":'$BOARD_ID',"name":"Todo"}'

# 正確
-d "{\"boardId\":${BOARD_ID},\"name\":\"Todo\"}"
```

---

## Bug 2：PATCH /tasks/:id/move — Unique Constraint 即時衝突

### 問題
執行 `PATCH /tasks/:id/move` 時，所有移動操作都回傳：
```json
{"error":"duplicate key value violates unique constraint \"tasks_column_id_order_key\""}
```

### 原因
PostgreSQL 的 `UNIQUE` constraint 預設是**逐行即時檢查（IMMEDIATE）**。

以同欄往後移為例（task order: 1→3，欄位共有 A:1, B:2, C:3, D:4）：
1. 先把 A 從 order 1 shift 到 3（此時 C 也是 3）→ **立即衝突！**

即使整個操作在同一個 transaction 裡，PostgreSQL 也不會等到 COMMIT 才驗證 UNIQUE，中途就會報錯並 rollback。

### 解法
將相關 unique constraint 改為 `DEFERRABLE INITIALLY DEFERRED`，讓 PostgreSQL 在 `COMMIT` 時才統一驗證：

```sql
-- 修改前
UNIQUE (column_id, "order")

-- 修改後
CONSTRAINT tasks_column_id_order_unique UNIQUE (column_id, "order") DEFERRABLE INITIALLY DEFERRED
```

同樣修改 `columns` 的 position constraint：
```sql
CONSTRAINT columns_board_id_position_unique UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED
```

因為 schema 變更需要重建 DB，使用 `docker compose down -v && docker compose up -d --build` 處理。

---

## Bug 3：DELETE /columns/:id — 回傳 204 而非 200

### 問題
Test script 預期 `DELETE /columns/:id`（無任務情況）回傳 HTTP 200，但 controller 回傳 204。

### 原因
Controller 實作時使用 `res.status(204).send()`，這在 REST 慣例上也是合理的（No Content），但測試規格期望 200 + JSON body。

### 解法
將 controller 改為回傳 200 + JSON：
```typescript
// 修改前
res.status(204).send();

// 修改後
res.status(200).json({ message: 'Column deleted' });
```

---

## 最終結果

| 測試類別 | 案例數 | 狀態 |
|---------|--------|------|
| Auth | 4 | ✅ 全過 |
| Projects | 2 | ✅ 全過 |
| Boards | 1 | ✅ 全過 |
| Columns | 2 | ✅ 全過 |
| Tasks CRUD | 4 | ✅ 全過 |
| PATCH /move（同欄/跨欄/夾值）| 6 | ✅ 全過 |
| Delete（task/column）| 3 | ✅ 全過 |
| 權限隔離 | 2 | ✅ 全過 |
| **Total** | **25** | **✅ 25/25** |

---

## Bug 4：PATCH /tasks/:id/move — 同欄判斷失效（型別陷阱）

### 問題
Jest 測試中，`newOrder 超出上界 → 自動夾值到 max` 案例失敗：預期 `order=3`，實際拿到 `order=4`。

### 原因
`service.moveTask()` 用 `===` 判斷是否為同欄位移動：

```typescript
const isSameColumn = oldColumnId === toColumnId;
```

- `oldColumnId = task.column_id` — 來自 node-postgres，BIGSERIAL 回傳**字串** `"88"`
- `toColumnId` — 來自 controller 的 `parseInt(toColumnId, 10)`，是**數字** `88`
- `"88" === 88` → `false`，同欄被誤判為**跨欄移動**

跨欄的 clamp 範圍是 `1..(targetCount + 1)`，所以 `newOrder=9999` 被夾到 `4`（3 tasks + 1），而非同欄的 `3`。

這個 bug 讓 SubAgent debug 了整整 10 小時，最後由主 Agent 接手，用 `docker exec psql` 直接查 DB 才確認 order 值異常，進而鎖定根因。

### 解法
在 service 層強制轉型：

```typescript
// 修改前
const oldOrder = task.order;
const oldColumnId = task.column_id;

// 修改後
const oldOrder = Number(task.order);
const oldColumnId = Number(task.column_id);
```

同樣修正 `deleteTask` 中傳入 `reorderTasksAfterDelete` 的參數：
```typescript
await taskRepo.reorderTasksAfterDelete(Number(task.column_id), Number(task.order), client);
```

### 根本對策
node-postgres 對所有 `BIGINT` / `BIGSERIAL` 欄位一律回傳字串（JS number 精度不足以表示 64-bit integer）。在 service 層做比較或計算時，**一律用 `Number()` 明確轉型**，或在 repository 層 `RETURNING` 時就用 `CAST(id AS INT)` 處理。

---

## Bug 5：Jest 測試環境 — 套件版本衝突

### 問題
SubAgent 安裝的 jest@30 / supertest@7 與 ts-jest@29 不相容，導致：
```
Error: Cannot find module 'jest-util'
```
Docker build 也因為 `package-lock.json` 與 `package.json` 不同步而失敗。

### 解法
固定套件版本並清除 node_modules 重裝：
```bash
npm install --save-dev jest@29 ts-jest@29 @types/jest@29 supertest@6 @types/supertest@6
rm -rf node_modules package-lock.json && npm install
```

---

## 最終結果（更新）

| 測試類別 | 案例數 | 框架 | 狀態 |
|---------|--------|------|------|
| Auth | 4 | bash | ✅ |
| Projects / Boards / Columns / Tasks | 18 | bash | ✅ |
| PATCH /move + 權限隔離 | 3 | bash | ✅ |
| **小計 bash** | **25** | bash | **✅ 25/25** |
| auth.test.ts | 6 | Jest | ✅ |
| projects.test.ts | 4 | Jest | ✅ |
| boards.test.ts | 4 | Jest | ✅ |
| columns.test.ts | 8 | Jest | ✅ |
| tasks.test.ts | 9 | Jest | ✅ |
| move.test.ts（含壓力測試）| 16 | Jest | ✅ |
| auth-guard.test.ts | 8 | Jest | ✅ |
| **小計 Jest** | **55** | Jest | **✅ 55/55** |

---

## 關鍵學習

1. **node-postgres 的 BIGSERIAL 回傳字串** — 比較或計算前一律 `Number()` 轉型，或在 SQL 層 `CAST AS INT`。`===` 的型別陷阱在 TypeScript 裡特別隱蔽，因為型別定義寫 `number` 但 runtime 是 `string`。
2. **PostgreSQL UNIQUE 是 IMMEDIATE 的** — 排序類操作（shift order）如果在 transaction 中間途產生重複值，即使最終不衝突也會報錯。凡是需要「先移開再補上」的場景，UNIQUE constraint 一律加 `DEFERRABLE INITIALLY DEFERRED`。
3. **HTTP 204 vs 200** — 刪除操作在 REST 語義上 204 是合法的，但若有 JSON body 需求就要用 200。API 設計時應在 PRD 階段明確定義。
4. **SubAgent 有 token 上限，複雜 debug 不適合長跑** — 遇到需要直接查 DB、對比 runtime 值的場景，主 Agent 接手更有效率。SubAgent 適合執行明確任務，不適合開放式 debug 迴圈。
5. **npm 套件版本要固定** — devDependency 使用 `@29`、`@6` 等 major 鎖版，避免 SubAgent 裝到不相容的新版。
