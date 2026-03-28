// ─── User ─────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface UserPublic {
  id: number;
  email: string;
}

// ─── Project ──────────────────────────────────────────────────────────────────
export interface Project {
  id: number;
  owner_id: number;
  name: string;
  created_at: Date;
}

// ─── Board ────────────────────────────────────────────────────────────────────
export interface Board {
  id: number;
  project_id: number;
  name: string;
  created_at: Date;
}

export interface TaskInBoard {
  id: number;
  title: string;
  description: string;
  order: number;
}

export interface ColumnInBoard {
  id: number;
  name: string;
  position: number;
  tasks: TaskInBoard[];
}

export interface BoardNested {
  id: number;
  name: string;
  columns: ColumnInBoard[];
}

// ─── Column ───────────────────────────────────────────────────────────────────
export interface Column {
  id: number;
  board_id: number;
  name: string;
  position: number;
  created_at: Date;
}

// ─── Task ─────────────────────────────────────────────────────────────────────
export interface Task {
  id: number;
  column_id: number;
  title: string;
  description: string;
  order: number;
  created_at: Date;
  updated_at: Date;
}

export interface TaskGrouped {
  columnId: number;
  tasks: Task[];
}

// ─── JWT Payload ──────────────────────────────────────────────────────────────
export interface JwtPayload {
  userId: number;
  email: string;
}

// ─── Express Request augmentation ─────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
