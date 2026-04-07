# PRD - Kanban 任務看板系統（Backend API）

## 1. 文件資訊
- 文件版本：v1.0
- 文件日期：2026-03-27
- 專案名稱：Kanban 任務看板系統（Backend）
- 文件目的：定義可交付開發與驗收的產品需求，供 PM、Backend、QA 對齊。

---

## 2. 產品目標（Product Goal）
提供一套多專案的 Kanban 任務管理 API，支援任務新增、編輯、刪除、排序、跨欄移動，並確保資料一致性與權限隔離。

核心成功指標：
- 任務排序與移動正確率 100%（無重複 order、無斷序）
- 權限隔離 100%（不得讀寫他人專案資料）
- API 在一般資料量下回應時間小於 500ms（P95）

---

## 3. 問題與價值
目前團隊需要可持續擴展的任務後端，重點痛點在於：
- 拖曳排序邏輯複雜，容易產生順序錯亂
- 多使用者場景下，權限與資料隔離容易出錯
- 缺乏統一錯誤格式與驗收準則

本專案價值：
- 提供一致的 API 規格，縮短前後端整合時間
- 以交易機制保障排序一致性，降低 production bug 風險
- 為後續協作、標籤、搜尋、分頁等功能保留擴充性

---

## 4. 目標使用者與角色
- 一般使用者（User）：管理自己的專案、看板、欄位、任務
- 系統：透過 JWT 辨識身份，依專案擁有權控管資料存取

---

## 5. 範圍（Scope）

### 5.1 In Scope（本期必做）
1. Auth：註冊、登入、JWT 驗證
2. Projects：建立專案、查詢我的專案
3. Boards：查詢單一看板（含 columns + tasks 巢狀資料）
4. Columns：新增、改名、刪除（有任務不可刪）
5. Tasks：新增、查詢、更新、刪除
6. 任務移動：同欄重排、跨欄移動（核心）
7. 權限：僅能操作自己的 project 與其底下資料
8. 錯誤格式：統一 `{ "error": "..." }`

### 5.2 Out of Scope（本期不做）
1. 即時同步（WebSocket）
2. 檔案附件
3. 複雜通知系統
4. 細粒度 RBAC（如 Admin/Editor/Viewer）

---

## 6. 功能需求（Functional Requirements）

### 6.1 Auth
1. `POST /auth/register`
- 建立使用者帳號
- `email` 不可重複，重複回 `400`

2. `POST /auth/login`
- 驗證成功回傳 JWT token
- 驗證失敗回 `401` 或 `400`（依錯誤策略）

### 6.2 Projects
1. `POST /projects`
- 建立專案
- 建立完成時，系統自動建立預設 board

2. `GET /projects`
- 只回傳目前登入者的專案列表

### 6.3 Boards
1. `GET /boards/:id`
- 回傳 board 資訊
- 巢狀包含 columns 與每欄 tasks（按 order 排序）

### 6.4 Columns
1. `POST /columns`
- 新增欄位到指定 board
- `position = 目前最大 position + 1`

2. `PUT /columns/:id`
- 更新欄位名稱

3. `DELETE /columns/:id`
- 欄位有任務時禁止刪除，回 `400`
- 欄位無任務才可刪除，刪除後需重排 position（避免斷序）

### 6.5 Tasks
1. `POST /tasks`
- 任務必須屬於某欄位
- 預設 `order = 該欄位最大 order + 1`

2. `GET /tasks?boardId=...`
- `boardId` 必填，缺少回 `400`
- 回傳依 column 分組資料，且每組按 order 遞增

3. `PUT /tasks/:id`
- 可更新 `title` / `description`

4. `DELETE /tasks/:id`
- 刪除任務後，原欄位後續任務 order 需補齊（連續）

### 6.6 任務拖曳（核心）
1. `PATCH /tasks/:id/move`
- Request:
```json
{
  "toColumnId": 12,
  "newOrder": 3
}
```

2. 同欄位移動
- `newOrder > oldOrder`：區間任務 `order - 1`
- `newOrder < oldOrder`：區間任務 `order + 1`

3. 跨欄位移動
- 原欄位中 `order > oldOrder`：`order - 1`
- 新欄位中 `order >= newOrder`：`order + 1`
- 更新 task 的 `column_id` 與 `order`

4. 交易要求
- 必須在同一個 transaction 內完成上述更新
- 任一操作失敗需 rollback

---

## 7. 權限與安全（Authorization & Security）
1. 所有 API（除 register/login）皆需 JWT 驗證
2. 使用者僅可存取自己的專案資料
3. 存取他人資料回 `403`
4. 密碼需以安全雜湊儲存（例如 bcrypt）
5. 不回傳敏感欄位（password hash 等）

---

## 8. 資料一致性規則（Data Integrity）
1. 同一欄位內 `tasks.order` 必須唯一且連續（1,2,3,...）
2. 同一看板內 `columns.position` 必須唯一且建議連續
3. 刪除 task 後需補齊排序
4. 任務移動需同步維護 source/target 欄位排序
5. 建議透過 DB unique constraint + transaction 雙重保護

---

## 9. 錯誤處理規範（Error Handling）

統一回應格式：
```json
{ "error": "錯誤訊息" }
```

狀態碼規範：
- `400` 參數錯誤 / 業務規則不成立
- `401` 未登入或 token 無效
- `403` 無權限
- `404` 資源不存在
- `500` 伺服器內部錯誤

---

## 10. 非功能需求（Non-Functional Requirements）
1. 效能：P95 API latency < 500ms（一般資料量）
2. 穩定性：核心 move API 在併發下不產生排序衝突
3. 架構：至少分層為 controller / service / repository
4. 設定：使用環境變數管理（DB URL、JWT Secret、Port）
5. 可測試性：核心排序與授權需可單元測試與整合測試

---

## 11. API 清單（MVP）
1. `POST /auth/register`
2. `POST /auth/login`
3. `POST /projects`
4. `GET /projects`
5. `GET /boards/:id`
6. `POST /columns`
7. `PUT /columns/:id`
8. `DELETE /columns/:id`
9. `POST /tasks`
10. `GET /tasks?boardId=...`
11. `PUT /tasks/:id`
12. `DELETE /tasks/:id`
13. `PATCH /tasks/:id/move`

---

## 12. 驗收標準（Definition of Done）
1. 所有 MVP API 可正常使用並通過測試
2. `PATCH /tasks/:id/move` 邏輯正確（同欄/跨欄皆正確）
3. 權限隔離通過（無法讀寫他人資料）
4. 任務與欄位排序無重複、無斷序
5. 錯誤碼與錯誤格式符合規範
6. 無 P1/P2 等級重大 bug

---

## 13. 風險與對策
1. 併發更新導致排序衝突
- 對策：交易 + row lock + 唯一約束

2. 權限判斷遺漏
- 對策：service 層集中授權檢查，加入整合測試

3. 前端拖曳帶入非法 newOrder
- 對策：後端統一夾值與參數檢核

---

## 14. 後續加值（Optional）
1. 任務分頁
2. 標題搜尋
3. 任務標籤（tags）
4. 多人協作專案
5. Swagger/OpenAPI 文件
6. Docker 化部署

