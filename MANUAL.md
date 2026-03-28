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

> **注意：** `newOrder` 超出範圍會自動夾值（太大 → 移到最後，太小 → 移到第一）

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

### 方式二：bash 快速測試

```bash
bash test.sh
```

---

## 測試涵蓋範圍說明

### Jest 測試（55 cases，7 個檔案）

#### `auth.test.ts`（6 cases）
- ✅ 成功註冊，回傳 id + email
- ✅ 重複 email 回 400
- ✅ 成功登入，回傳 token
- ✅ 密碼錯誤回 401
- ✅ 缺少 email 欄位回 400
- ✅ 缺少 password 欄位回 400

#### `projects.test.ts`（4 cases）
- ✅ 建立專案，回傳 id + name + boardId
- ✅ 建立後自動存在 Default Board
- ✅ GET /projects 只回傳自己的專案（隔離驗證）
- ✅ 未登入回 401

#### `boards.test.ts`（4 cases）
- ✅ 回傳巢狀結構（columns + tasks，按 order 排序）
- ✅ 存取他人 board 回 403
- ✅ 不存在的 board 回 404
- ✅ 未登入回 401

#### `columns.test.ts`（8 cases）
- ✅ 新增欄位，position 自動遞增
- ✅ 連續新增多欄，position 正確（1, 2, 3...）
- ✅ 改名成功
- ✅ 有任務的欄位刪除回 400
- ✅ 無任務的欄位刪除成功
- ✅ 刪除後其餘欄位 position 重排，保持連續
- ✅ 存取他人欄位回 403
- ✅ 未登入回 401

#### `tasks.test.ts`（9 cases）
- ✅ 新增任務，order 自動遞增
- ✅ GET /tasks?boardId 按 column 分組，按 order 排序
- ✅ 未帶 boardId 回 400
- ✅ 更新 title 和 description
- ✅ 刪除任務後，同欄 order 補齊（無斷序）
- ✅ 刪除欄位裡最後一個任務不報錯
- ✅ 存取他人任務回 403
- ✅ 不存在的任務回 404
- ✅ 未登入回 401

#### `move.test.ts`（16 cases）— 核心
**基本移動邏輯：**
- ✅ 同欄往後移（1→3），中間任務自動 -1
- ✅ 同欄往前移（3→1），中間任務自動 +1
- ✅ 同欄 newOrder == oldOrder → no-op，直接回傳，不更新
- ✅ 跨欄移動：source 欄補位，target 欄騰位，task columnId 更新
- ✅ 跨欄移到空欄（newOrder=1）
- ✅ 跨欄後 source 欄 order 連續驗證
- ✅ 跨欄後 target 欄 order 連續驗證

**邊界夾值：**
- ✅ newOrder 超出上界（9999）→ 自動夾到最後一位
- ✅ newOrder = 0 → 自動夾到 1
- ✅ newOrder 負數 → 自動夾到 1
- ✅ 移到同欄最後（newOrder = count）

**壓力測試（Concurrent）：**
- ✅ 同時發出 10 個 move 請求，完成後 order 無重複、無斷序（驗證 transaction + row lock 的有效性）

**權限：**
- ✅ 存取他人任務回 403
- ✅ 移動到他人欄位回 403

#### `auth-guard.test.ts`（8 cases）
- ✅ 無 token 存取 GET /projects → 401
- ✅ 無效 token 存取 → 401
- ✅ 格式錯誤的 token → 401
- ✅ user A token 存取 user B 的 board → 403
- ✅ user A token 存取 user B 的 column（新增/刪除）→ 403
- ✅ user A token 存取 user B 的 task（更新）→ 403
- ✅ user A token 移動 user B 的 task → 403
- ✅ user A token 查詢 user B 的 tasks → 403

---

### bash 測試（25 cases）

快速冒煙測試，涵蓋所有 API 的基本正常流程 + 權限隔離，適合在部署後快速確認環境是否正常。

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

# 跑 bash 快速測試
bash test.sh

# 查看目前在跑的 container
docker compose ps
```
