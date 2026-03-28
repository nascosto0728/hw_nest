#!/bin/bash

BASE="http://localhost:3000"
PASS=0
FAIL=0

green() { echo -e "\033[32m✅ $1\033[0m"; }
red()   { echo -e "\033[31m❌ $1\033[0m"; }

# JSON 欄位解析（用 python3）
jget() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$2)" 2>/dev/null; }

check_contains() {
  local label=$1 expected=$2 actual=$3
  if echo "$actual" | grep -q "$expected"; then
    green "$label"; PASS=$((PASS+1))
  else
    red "$label → 預期含: $expected | 實際: $actual"; FAIL=$((FAIL+1))
  fi
}

check_status() {
  local label=$1 expected=$2 actual=$3
  if [ "$actual" = "$expected" ]; then
    green "$label"; PASS=$((PASS+1))
  else
    red "$label → 預期 HTTP $expected | 實際: $actual"; FAIL=$((FAIL+1))
  fi
}

SUFFIX=$$

echo ""
echo "==============================="
echo "  Kanban Backend API 測試"
echo "==============================="

# ── Auth ──────────────────────────────────────────────────────────
echo ""
echo "[ Auth ]"

R=$(curl -s -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test_${SUFFIX}@example.com\",\"password\":\"123456\"}")
check_contains "POST /auth/register" '"email"' "$R"
EMAIL="test_${SUFFIX}@example.com"

SC=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"123456\"}")
check_status "POST /auth/register (重複 email → 400)" "400" "$SC"

R=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"123456\"}")
check_contains "POST /auth/login" '"token"' "$R"
TOKEN=$(jget "$R" "['token']")

SC=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"wrong\"}")
check_status "POST /auth/login (密碼錯誤 → 401)" "401" "$SC"

# ── Projects ──────────────────────────────────────────────────────
echo ""
echo "[ Projects ]"

R=$(curl -s -X POST $BASE/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"測試專案"}')
check_contains "POST /projects" '"boardId"' "$R"
BOARD_ID=$(jget "$R" "['boardId']")

R=$(curl -s $BASE/projects \
  -H "Authorization: Bearer $TOKEN")
check_contains "GET /projects" '"測試專案"' "$R"

# ── Boards + Columns setup ────────────────────────────────────────
echo ""
echo "[ Boards ]"

R=$(curl -s -X POST $BASE/columns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"boardId\":${BOARD_ID},\"name\":\"Todo\"}")
COL1=$(jget "$R" "['id']")

R=$(curl -s -X POST $BASE/columns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"boardId\":${BOARD_ID},\"name\":\"In Progress\"}")
COL2=$(jget "$R" "['id']")

R=$(curl -s $BASE/boards/$BOARD_ID \
  -H "Authorization: Bearer $TOKEN")
check_contains "GET /boards/:id (巢狀 columns)" '"columns"' "$R"

# ── Columns ───────────────────────────────────────────────────────
echo ""
echo "[ Columns ]"

R=$(curl -s -X POST $BASE/columns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"boardId\":${BOARD_ID},\"name\":\"Done\"}")
check_contains "POST /columns" '"position"' "$R"
COL3=$(jget "$R" "['id']")

R=$(curl -s -X PUT $BASE/columns/$COL3 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"完成"}')
check_contains "PUT /columns/:id" '"完成"' "$R"

# ── Tasks ─────────────────────────────────────────────────────────
echo ""
echo "[ Tasks ]"

R=$(curl -s -X POST $BASE/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"columnId\":${COL1},\"title\":\"任務A\"}")
T1=$(jget "$R" "['id']")

R=$(curl -s -X POST $BASE/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"columnId\":${COL1},\"title\":\"任務B\"}")
T2=$(jget "$R" "['id']")

R=$(curl -s -X POST $BASE/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"columnId\":${COL1},\"title\":\"任務C\"}")
T3=$(jget "$R" "['id']")

R=$(curl -s -X POST $BASE/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"columnId\":${COL1},\"title\":\"任務D\",\"description\":\"描述\"}")
check_contains "POST /tasks" '"order"' "$R"

R=$(curl -s "$BASE/tasks?boardId=${BOARD_ID}" \
  -H "Authorization: Bearer $TOKEN")
check_contains "GET /tasks?boardId=..." '"任務A"' "$R"

SC=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/tasks" \
  -H "Authorization: Bearer $TOKEN")
check_status "GET /tasks (無 boardId → 400)" "400" "$SC"

R=$(curl -s -X PUT $BASE/tasks/$T1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"任務A（已更新）"}')
check_contains "PUT /tasks/:id" '"任務A（已更新）"' "$R"

# ── Move（核心）──────────────────────────────────────────────────
echo ""
echo "[ PATCH /tasks/:id/move ]"

# T1=order1, T2=order2, T3=order3, T4=order4
# 同欄往後：T1(1→3)
R=$(curl -s -X PATCH $BASE/tasks/$T1/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"toColumnId\":${COL1},\"newOrder\":3}")
check_contains "同欄位往後移 (1→3)" '"order"' "$R"
ORDER=$(jget "$R" "['order']")
[ "$ORDER" = "3" ] && green "  └ order 值正確 (3)" && PASS=$((PASS+1)) || { red "  └ order 應為 3，實際: $ORDER"; FAIL=$((FAIL+1)); }

# 同欄往前：T1(3→1)
R=$(curl -s -X PATCH $BASE/tasks/$T1/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"toColumnId\":${COL1},\"newOrder\":1}")
check_contains "同欄位往前移 (3→1)" '"order"' "$R"
ORDER=$(jget "$R" "['order']")
[ "$ORDER" = "1" ] && green "  └ order 值正確 (1)" && PASS=$((PASS+1)) || { red "  └ order 應為 1，實際: $ORDER"; FAIL=$((FAIL+1)); }

# 跨欄：T1 → COL2
R=$(curl -s -X PATCH $BASE/tasks/$T1/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"toColumnId\":${COL2},\"newOrder\":1}")
check_contains "跨欄位移動" '"columnId"' "$R"
NEW_COL=$(jget "$R" "['columnId']")
[ "$NEW_COL" = "$COL2" ] && green "  └ columnId 正確 ($COL2)" && PASS=$((PASS+1)) || { red "  └ columnId 應為 $COL2，實際: $NEW_COL"; FAIL=$((FAIL+1)); }

# newOrder 999 → 自動夾值
R=$(curl -s -X PATCH $BASE/tasks/$T2/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"toColumnId\":${COL1},\"newOrder\":999}")
check_contains "newOrder 超出夾值" '"order"' "$R"

# ── Delete ────────────────────────────────────────────────────────
echo ""
echo "[ Delete ]"

curl -s -X DELETE $BASE/tasks/$T3 \
  -H "Authorization: Bearer $TOKEN" > /dev/null

R=$(curl -s "$BASE/tasks?boardId=${BOARD_ID}" \
  -H "Authorization: Bearer $TOKEN")
check_contains "DELETE /tasks/:id (執行不報錯)" '"order"' "$R"

SC=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE $BASE/columns/$COL1 \
  -H "Authorization: Bearer $TOKEN")
check_status "DELETE /columns/:id (有任務 → 400)" "400" "$SC"

SC=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE $BASE/columns/$COL3 \
  -H "Authorization: Bearer $TOKEN")
check_status "DELETE /columns/:id (無任務 → 200)" "200" "$SC"

# ── 權限隔離 ──────────────────────────────────────────────────────
echo ""
echo "[ 權限隔離 ]"

EMAIL2="test2_${SUFFIX}@example.com"
curl -s -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL2}\",\"password\":\"123456\"}" > /dev/null
R2=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL2}\",\"password\":\"123456\"}")
TOKEN2=$(jget "$R2" "['token']")

SC=$(curl -s -o /dev/null -w "%{http_code}" $BASE/boards/$BOARD_ID \
  -H "Authorization: Bearer $TOKEN2")
check_status "他人 board → 403" "403" "$SC"

SC=$(curl -s -o /dev/null -w "%{http_code}" $BASE/projects)
check_status "無 token → 401" "401" "$SC"

# ── 結果 ──────────────────────────────────────────────────────────
echo ""
echo "==============================="
echo "  結果：✅ $PASS 通過 | ❌ $FAIL 失敗"
echo "==============================="
echo ""
