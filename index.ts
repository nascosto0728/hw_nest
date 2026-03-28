import dotenv from 'dotenv';
dotenv.config();

import app from './src/app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.listen(PORT, () => {
  console.log(`🚀 Kanban API server running on port ${PORT}`);
});
