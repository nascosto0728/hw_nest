# Kanban Backend — 操作手冊

## 目錄
1. [環境需求](#環境需求)
2. [啟動服務](#啟動服務)
3. [API 使用流程](#api-使用流程)
4. [執行測試](#執行測試)
5. [測試涵蓋範圍說明](#測試涵蓋範圍說明)
6. [常用指令速查](#常用指令速查)

---

## 環境需求

- Docker + Docker Compose
- Node.js 20+（執行測試用）
- 本機 port 3000 未被佔用（App）
- 本機 port 5432 若已被佔用無妨（DB 僅供 container 內部使用）

---

## 啟動服務

```bash
cd /Users/enzo/.openclaw/workspace/Kanban_backend

# 第一次啟動（或清除資料重來）
docker compose down -v
docker compose up -d --build

# 之後日常啟動
docker compose up -d

# 確認狀態
docker compose ps
```

啟動成功後：
- App：`http://localhost:3000`
- DB：在 container 內部，外部無法直連

停止服務：
```bash
docker compose down          # 停止，保留 DB 資料
docker compose down -v       # 停止並清除所有 DB 資料
```

---

## API 使用流程

> 所有請求（除了 register / login）都需要在 Header 帶上 JWT Token：
> `Authorization: Bearer <token>`

### Step 1：註冊 & 登入

```bash
# 註冊
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}' | jq

# 登入，取得 token
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}' | jq

# 把 token 存起來方便後續使用
TOKEN="貼上你的 token"
```

### Step 2：建立專案

```bash
# 建立專案（同時自動建立一個 Default Board）
curl -s -X POST http://localhost:3000/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"我的專案"}' | jq

# 回傳範例：
# { "id": 1, "name": "我的專案", "boardId": 1 }
# 記下 boardId
```

### Step 3：查看 Board

```bash
# 查看 board（包含所有 columns 和 tasks）
curl -s http://localhost:3000/boards/1 \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Step 4：建立欄位（Column）

```bash
# 新增欄位到 board
curl -s -X POST http://localhost:3000/columns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"boardId":1,"name":"Todo"}' | jq

curl -s -X POST http://localhost:3000/columns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"boardId":1,"name":"In Progress"}' | jq

# 改名
curl -s -X PUT http://localhost:3000/columns/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"待辦"}' | jq

# 刪除（無任務才能刪）
curl -s -X DELETE http://localhost:3000/columns/1 \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Step 5：建立任務（Task）

```bash
# 新增任務
curl -s -X POST http://localhost:3000/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"columnId":1,"title":"第一張卡","description":"這是描述"}' | jq

# 查詢（按 board 查，回傳所有欄位的任務）
curl -s "http://localhost:3000/tasks?boardId=1" \
  -H "Authorization: Bearer $TOKEN" | jq

# 更新
curl -s -X PUT http://localhost:3000/tasks/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"更新後的標題","description":""}' | jq

# 刪除
curl -s -X DELETE http://localhost:3000/tasks/1 \
  -H "Authorization: Bearer $TOKEN"
```

### Step 6：移動任務（核心功能）

```bash
# 同欄位重排（把 task 1 移到 order 3）
curl -s -X PATCH http://localhost:3000/tasks/1/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"toColumnId":1,"newOrder":3}' | jq

# 跨欄移動（把 task 1 從欄位 1 移到欄位 2 的第 1 位）
curl -s -X PATCH http://localhost:3000/tasks/1/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"toColumnId":2,"newOrder":1}' | jq

# 回傳範例：
# { "id": 1, "columnId": 2, "order": 1 }
```

> **注意：** `newOrder` 太大會自動夾值移到最後；太小（< 1）則會回傳 `400 Bad Request`。

---

## 執行測試

### 前提：Docker 服務必須在跑

```bash
docker compose up -d
docker compose ps   # 確認 kanban-app 和 kanban-db 都是 healthy/running
```

---

### 方式一：Jest 完整測試（推薦）

```bash
npm test
```

跑特定測試檔：
```bash
npm test -- __tests__/move.test.ts
npm test -- __tests__/auth.test.ts
```

跑特定測試名稱（模糊匹配）：
```bash
npm test -- -t "跨欄"
npm test -- -t "concurrent"
```

---

## 測試涵蓋範圍說明

### Jest 測試（56 cases，7 個檔案）

#### `auth.test.ts`（8 cases）
- ✅ 成功註冊，回傳 id + email
- ✅ 重複 email → 400
- ✅ 缺少 email 欄位（register）→ 400
- ✅ 缺少 password 欄位（register）→ 400
- ✅ 成功登入，回傳 token
- ✅ 錯誤密碼 → 401
- ✅ 缺少 email 欄位（login）→ 400
- ✅ 缺少 password 欄位（login）→ 400

#### `projects.test.ts`（4 cases）
- ✅ 建立專案，回傳 id + name + boardId
- ✅ 建立後自動有 Default Board（GET /boards/:id 可存取）
- ✅ GET /projects 只回傳自己的專案
- ✅ 未登入 → 401

#### `boards.test.ts`（3 cases）
- ✅ GET /boards/:id 回傳巢狀 columns + tasks
- ✅ 他人 board → 403
- ✅ 不存在 board → 404

#### `columns.test.ts`（4 cases）
- ✅ POST /columns，position 自動遞增
- ✅ PUT /columns/:id 改名
- ✅ DELETE /columns/:id 有任務 → 400
- ✅ DELETE /columns/:id 無任務成功，其他 column position 重排連續

#### `tasks.test.ts`（6 cases）
- ✅ POST /tasks，order 自動遞增
- ✅ GET /tasks?boardId=... 按 column 分組，按 order 排序
- ✅ GET /tasks 無 boardId → 400
- ✅ PUT /tasks/:id 更新 title/description
- ✅ DELETE /tasks/:id 後同欄 order 連續（驗證補齊）
- ✅ 刪完欄裡最後一個 task 後不報錯

#### `move.test.ts`（11 cases）— 核心
**基本移動與邊界夾值：**
- ✅ 同欄往後移（1→3），中間 tasks order 正確 -1
- ✅ 同欄往前移（3→1），中間 tasks order 正確 +1
- ✅ 同欄 newOrder == oldOrder → no-op，直接回傳
- ✅ 跨欄移動，source 欄補位，target 欄騰位，task columnId 更新
- ✅ 跨欄移到空欄（newOrder=1）
- ✅ newOrder 超出上界 → 自動夾值到 max
- ✅ newOrder = 0 → 400（驗證規格）
- ✅ newOrder 負數 → 400
- ✅ 移到同欄最後（newOrder = count）
- ✅ 跨 board 移動 → 400

**壓力測試（Concurrent）：**
- ✅ 併發 10 個 move 請求，最終 order 無重複且連續

#### `auth-guard.test.ts`（20 cases）
- ✅ **11 個無 token 阻擋測試（401）**：防護所有 GET, POST, PUT, DELETE, PATCH 的未登入存取
- ✅ **3 個無效 token 阻擋測試（401）**：確保偽造 Token 失效
- ✅ **6 個跨用戶權限隔離測試（403）**：測試 User A 嘗試存取、修改、刪除、移動 User B 的資料時確實拋出 403 Forbidden

---


## 常用指令速查

```bash
# 啟動
docker compose up -d

# 停止
docker compose down

# 清除資料重啟
docker compose down -v && docker compose up -d --build

# 查 log
docker compose logs app -f
docker compose logs db -f

# 跑全部 Jest 測試
npm test

# 跑單一測試檔
npm test -- __tests__/move.test.ts


# 查看目前在跑的 container
docker compose ps
```
