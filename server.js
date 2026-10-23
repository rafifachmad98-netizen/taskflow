
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const cookieParser = require("cookie-parser");
const { doubleCsrf } = require("csrf-csrf");

const app = express();
const PORT = process.env.PORT || 3000;

// 1. SESSION SECRET
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error(
    "SESSION_SECRET wajib diisi dengan secret minimal 32 karakter."
  );
}

// 2. DATABASE
const db = new DatabaseSync(
  path.join(__dirname, "taskflow.db")
);

// 3. MIDDLEWARE DASAR
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

app.use(
  session({
    name: "taskflow.sid",
    secret: sessionSecret,
    store: new SQLiteStore({
      db: "sessions.sqlite",
      dir: __dirname,
      table: "sessions",
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(cookieParser());

// 4. CSRF CONFIGURATION
const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => sessionSecret,
  getSessionIdentifier: (req) => req.session.id,
  cookieName: "taskflow.csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
  getCsrfTokenFromRequest: (req) =>
    req.headers["x-csrf-token"],
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
});

// Endpoint ini harus tersedia agar frontend bisa meminta token.
app.get("/api/csrf-token", (req, res, next) => {
    // Pastikan session diubah dan disimpan sebelum token dibuat.
    req.session.csrfInitialized = true;
  
    req.session.save((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }
  
      try {
        const csrfToken = generateCsrfToken(req, res, {
          overwrite: req.query.refresh === "1",
        });
  
        res.set("Cache-Control", "no-store");
        res.json({ csrfToken });
      } catch (error) {
        next(error);
      }
    });
  });
// Lindungi request yang mengubah data.
app.use(doubleCsrfProtection);

// 5. RATE LIMIT AUTH
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
  },
});

// 6. DATABASE TABLES & MIGRATIONS
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  );
`);

function getTaskColumns() {
  return db.prepare("PRAGMA table_info(tasks)").all();
}

let taskColumns = getTaskColumns();

if (!taskColumns.some((column) => column.name === "priority")) {
  db.exec(`
    ALTER TABLE tasks
    ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'
  `);
}

if (!taskColumns.some((column) => column.name === "due_date")) {
  db.exec(`
    ALTER TABLE tasks
    ADD COLUMN due_date TEXT DEFAULT NULL
  `);
}

taskColumns = getTaskColumns();

if (!taskColumns.some((column) => column.name === "user_id")) {
  db.exec(`
    ALTER TABLE tasks
    ADD COLUMN user_id INTEGER REFERENCES users(id)
  `);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_user_id
  ON tasks(user_id)
`);

// 7. HELPER FUNCTIONS
function formatTask(task) {
  return {
    ...task,
    completed: Boolean(task.completed),
  };
}

function isValidPriority(priority) {
  return ["low", "medium", "high"].includes(priority);
}

function isValidDate(date) {
  if (date === null || date === "") return true;
  if (typeof date !== "string") return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Silakan login terlebih dahulu.",
    });
  }

  next();
}

// 8. REGISTER
app.post("/api/register", authLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Nama, email, dan password wajib diisi.",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || cleanName.length > 80) {
      return res.status(400).json({
        message: "Nama wajib diisi dan maksimal 80 karakter.",
      });
    }

    if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      return res.status(400).json({
        message: "Format email tidak valid.",
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        message: "Password harus terdiri dari 8–72 karakter.",
      });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(cleanEmail);

    if (existingUser) {
      return res.status(409).json({
        message: "Email sudah terdaftar.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db
      .prepare(`
        INSERT INTO users (name, email, password_hash)
        VALUES (?, ?, ?)
      `)
      .run(cleanName, cleanEmail, passwordHash);

    const userId = Number(result.lastInsertRowid);

    await regenerateSession(req);
    req.session.userId = userId;
    await saveSession(req);

    res.status(201).json({
      message: "Registrasi berhasil.",
      user: {
        id: userId,
        name: cleanName,
        email: cleanEmail,
      },
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        message: "Email sudah terdaftar.",
      });
    }

    next(error);
  }
});

// 9. LOGIN
app.post("/api/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Email dan password wajib diisi.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const user = db
      .prepare(`
        SELECT id, name, email, password_hash
        FROM users
        WHERE email = ?
      `)
      .get(cleanEmail);

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        message: "Email atau password salah.",
      });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    res.json({
      message: "Login berhasil.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

// 10. CEK STATUS LOGIN
app.get("/api/me", (req, res, next) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }

  const user = db
    .prepare(`
      SELECT id, name, email
      FROM users
      WHERE id = ?
    `)
    .get(req.session.userId);

  if (!user) {
    return req.session.destroy((error) => {
      if (error) return next(error);

      res.clearCookie("taskflow.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });

      res.json({ user: null });
    });
  }

  res.json({ user });
});

// 11. LOGOUT
app.post("/api/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("taskflow.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    res.json({ message: "Logout berhasil." });
  });
});

// 12. GET TASKS
app.get("/api/tasks", requireAuth, (req, res) => {
  const tasks = db
    .prepare(`
      SELECT id, title, completed, priority, due_date
      FROM tasks
      WHERE user_id = ?
      ORDER BY id DESC
    `)
    .all(req.session.userId);

  res.json(tasks.map(formatTask));
});

// 13. CREATE TASK
app.post("/api/tasks", requireAuth, (req, res) => {
  const {
    title,
    priority = "medium",
    due_date = null,
  } = req.body || {};

  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 120
  ) {
    return res.status(400).json({
      message: "Judul wajib diisi dan maksimal 120 karakter.",
    });
  }

  if (!isValidPriority(priority)) {
    return res.status(400).json({
      message: "Prioritas tidak valid.",
    });
  }

  if (!isValidDate(due_date)) {
    return res.status(400).json({
      message: "Format deadline harus YYYY-MM-DD.",
    });
  }

  const result = db
    .prepare(`
      INSERT INTO tasks (title, priority, due_date, user_id)
      VALUES (?, ?, ?, ?)
    `)
    .run(
      title.trim(),
      priority,
      due_date || null,
      req.session.userId
    );

  const task = db
    .prepare(`
      SELECT id, title, completed, priority, due_date
      FROM tasks
      WHERE id = ? AND user_id = ?
    `)
    .get(Number(result.lastInsertRowid), req.session.userId);

  res.status(201).json(formatTask(task));
});

// 14. UPDATE TASK
app.patch("/api/tasks/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      message: "ID task tidak valid.",
    });
  }

  const task = db
    .prepare(`
      SELECT id, title, completed, priority, due_date
      FROM tasks
      WHERE id = ? AND user_id = ?
    `)
    .get(id, req.session.userId);

  if (!task) {
    return res.status(404).json({
      message: "Task tidak ditemukan.",
    });
  }

  const body = req.body || {};
  const allowedFields = [
    "title",
    "priority",
    "due_date",
    "completed",
  ];

  if (
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (field) => !allowedFields.includes(field)
    )
  ) {
    return res.status(400).json({
      message: "Field update tidak dikenal atau tidak valid.",
    });
  }

  let title = task.title;
  let priority = task.priority;
  let dueDate = task.due_date;
  let completed = task.completed;

  if (Object.hasOwn(body, "title")) {
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.trim().length > 120
    ) {
      return res.status(400).json({
        message: "Judul wajib diisi dan maksimal 120 karakter.",
      });
    }

    title = body.title.trim();
  }

  if (Object.hasOwn(body, "priority")) {
    if (!isValidPriority(body.priority)) {
      return res.status(400).json({
        message: "Prioritas tidak valid.",
      });
    }

    priority = body.priority;
  }

  if (Object.hasOwn(body, "due_date")) {
    if (!isValidDate(body.due_date)) {
      return res.status(400).json({
        message: "Format deadline harus YYYY-MM-DD.",
      });
    }

    dueDate = body.due_date || null;
  }

  if (Object.hasOwn(body, "completed")) {
    if (typeof body.completed !== "boolean") {
      return res.status(400).json({
        message: "Status completed harus berupa boolean.",
      });
    }

    completed = body.completed ? 1 : 0;
  } else if (Object.keys(body).length === 0) {
    completed = task.completed ? 0 : 1;
  }

  db.prepare(`
    UPDATE tasks
    SET title = ?, priority = ?, due_date = ?, completed = ?
    WHERE id = ? AND user_id = ?
  `).run(
    title,
    priority,
    dueDate,
    completed,
    id,
    req.session.userId
  );

  const updatedTask = db
    .prepare(`
      SELECT id, title, completed, priority, due_date
      FROM tasks
      WHERE id = ? AND user_id = ?
    `)
    .get(id, req.session.userId);

  res.json(formatTask(updatedTask));
});

// 15. DELETE TASK
app.delete("/api/tasks/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      message: "ID task tidak valid.",
    });
  }

  const result = db
    .prepare(`
      DELETE FROM tasks
      WHERE id = ? AND user_id = ?
    `)
    .run(id, req.session.userId);

  if (result.changes === 0) {
    return res.status(404).json({
      message: "Task tidak ditemukan.",
    });
  }

  res.json({ message: "Task berhasil dihapus." });
});

// 16. FRONTEND STATIC FILES
app.use(express.static(path.join(__dirname, "public")));

// 17. ERROR HANDLER
app.use((error, req, res, next) => {
    console.error("DEBUG ERROR:", error.code, error.message);
  if (res.headersSent) {
    return next(error);
  }

  if (
    error.code === "EBADCSRFTOKEN" ||
    error.status === 403
  ) {
    return res.status(403).json({
      message: "Token keamanan tidak valid. Muat ulang halaman dan coba lagi.",
    });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Format JSON tidak valid.",
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      message: "Ukuran request terlalu besar. Maksimal 10 KB.",
    });
  }

  console.error(error);

  res.status(500).json({
    message: "Terjadi kesalahan pada server.",
  });
});

// 18. START SERVER
app.listen(PORT, () => {
  console.log(`TaskFlow berjalan di http://localhost:${PORT}`);
});
