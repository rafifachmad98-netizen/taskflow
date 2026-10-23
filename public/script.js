
const taskList = document.getElementById("task-list");
const taskCount = document.getElementById("task-count");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const errorMessage = document.getElementById("error-message");

const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const searchInput = document.getElementById("search-input");
const taskFilter = document.getElementById("task-filter");
const emptyState = document.getElementById("empty-state");
const taskPriority = document.getElementById("task-priority");
const taskDueDate = document.getElementById("task-due-date");

const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editTitle = document.getElementById("edit-title");
const editPriority = document.getElementById("edit-priority");
const editDueDate = document.getElementById("edit-due-date");
const editError = document.getElementById("edit-error");
const closeModalButton = document.getElementById("close-modal");
const cancelEditButton = document.getElementById("cancel-edit");
const modalBackdrop = document.getElementById("modal-backdrop");

let editingTaskId = null;
let allTasks = [];
let csrfToken = "";

// ========================================
// CSRF PROTECTION
// ========================================

// Mengambil token CSRF dari backend.
async function refreshCsrfToken(forceRefresh = false) {
  const url = forceRefresh
    ? "/api/csrf-token?refresh=1"
    : "/api/csrf-token";

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.csrfToken) {
    throw new Error(
      data.message || "Gagal mengambil CSRF token."
    );
  }

  csrfToken = data.csrfToken;
  return csrfToken;
}

// Request yang mengubah data harus membawa token CSRF.
async function csrfFetch(url, options = {}) {
  if (!csrfToken) {
    await refreshCsrfToken();
  }

  const headers = new Headers(options.headers || {});
  headers.set("x-csrf-token", csrfToken);

  return fetch(url, {
    ...options,
    headers
  });
}

// ========================================
// HELPER
// ========================================

const priorityRank = {
  high: 3,
  medium: 2,
  low: 1
};

// Mengambil pesan error dari server.
async function getErrorMessage(response, fallback) {
  try {
    const data = await response.json();
    return data.message || data.error || fallback;
  } catch {
    return fallback;
  }
}

// Menghasilkan tanggal lokal dalam format YYYY-MM-DD.
function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Format tanggal tanpa masalah perbedaan zona waktu.
function formatDate(dateString) {
  const [year, month, day] = dateString.split("-");
  return `${day}-${month}-${year}`;
}

// Menentukan status deadline sebuah tugas.
function getDeadlineStatus(task) {
  if (!task.due_date) {
    return "none";
  }

  if (task.completed) {
    return "completed";
  }

  const today = getTodayDate();

  if (task.due_date < today) {
    return "overdue";
  }

  if (task.due_date === today) {
    return "today";
  }

  return "upcoming";
}

// Mengambil teks indikator deadline.
function getDeadlineLabel(task) {
  const status = getDeadlineStatus(task);

  switch (status) {
    case "overdue":
      return `Terlambat · ${formatDate(task.due_date)}`;

    case "today":
      return `Deadline hari ini · ${formatDate(task.due_date)}`;

    case "upcoming":
      return `Deadline · ${formatDate(task.due_date)}`;

    case "completed":
      return `Deadline · ${formatDate(task.due_date)}`;

    case "none":
    default:
      return "Belum ada deadline";
  }
}

// Mengurutkan tugas sesuai pilihan.
function sortTasks(tasks) {
  const sortSelect = document.getElementById("task-sort");
  const sortBy = sortSelect ? sortSelect.value : "newest";

  const sortedTasks = [...tasks];

  sortedTasks.sort((a, b) => {
    if (sortBy === "priority") {
      const priorityDifference =
        (priorityRank[b.priority] || 2) -
        (priorityRank[a.priority] || 2);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return (b.id || 0) - (a.id || 0);
    }

    if (sortBy === "deadline") {
      if (!a.due_date && !b.due_date) {
        return (b.id || 0) - (a.id || 0);
      }

      if (!a.due_date) return 1;
      if (!b.due_date) return -1;

      const deadlineDifference =
        a.due_date.localeCompare(b.due_date);

      if (deadlineDifference !== 0) {
        return deadlineDifference;
      }

      return (b.id || 0) - (a.id || 0);
    }

    if (sortBy === "completed") {
      if (Boolean(a.completed) !== Boolean(b.completed)) {
        return a.completed ? 1 : -1;
      }

      return (b.id || 0) - (a.id || 0);
    }

    if (sortBy === "oldest") {
      return (a.id || 0) - (b.id || 0);
    }

    return (b.id || 0) - (a.id || 0);
  });

  return sortedTasks;
}

// Mengambil data tugas dari API.
async function loadTasks() {
  try {
    const response = await fetch("/api/tasks");

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(response, "Gagal mengambil tugas.")
      );
    }

    allTasks = await response.json();

    renderTasks();
    updateDashboard();

    errorMessage.textContent = "";
  } catch (error) {
    errorMessage.textContent =
      "Gagal mengambil data. Periksa koneksi dan server backend.";

    console.error(error);
  }
}

// ========================================
// RENDER TASK
// ========================================

function renderTasks() {
  const keyword = searchInput.value.trim().toLowerCase();
  const filter = taskFilter.value;

  const filteredTasks = allTasks.filter((task) => {
    const matchesSearch = task.title
      .toLowerCase()
      .includes(keyword);

    const matchesFilter =
      filter === "all" ||
      (filter === "pending" && !task.completed) ||
      (filter === "completed" && Boolean(task.completed));

    return matchesSearch && matchesFilter;
  });

  const sortedTasks = sortTasks(filteredTasks);

  taskList.replaceChildren();
  emptyState.hidden = sortedTasks.length > 0;

  if (sortedTasks.length === 0) {
    if (keyword) {
      emptyState.textContent =
        "Tugas tidak ditemukan. Coba kata kunci lain!";
    } else if (filter === "pending") {
      emptyState.textContent =
        "Tidak ada tugas yang belum selesai.";
    } else if (filter === "completed") {
      emptyState.textContent =
        "Belum ada tugas yang selesai.";
    } else {
      emptyState.textContent =
        "Belum ada tugas. Tambahkan tugas pertamamu!";
    }
  }

  sortedTasks.forEach((task, index) => {
    const card = document.createElement("article");
    card.className = "task";

    const deadlineStatus = getDeadlineStatus(task);

    if (deadlineStatus === "overdue") {
      card.classList.add("task-overdue");
    } else if (deadlineStatus === "today") {
      card.classList.add("task-due-today");
    } else if (deadlineStatus === "completed") {
      card.classList.add("task-completed");
    }

    const number = document.createElement("div");
    number.className = "task-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const info = document.createElement("div");
    info.className = "task-info";

    const title = document.createElement("h3");
    title.textContent = task.title;

    const description = document.createElement("p");
    description.textContent = task.completed
      ? "Mantap, sudah selesai!"
      : "Ayo, lanjut belajar!";

    const priorityValue = ["low", "medium", "high"].includes(
      task.priority
    )
      ? task.priority
      : "medium";

    const priorityLabels = {
      low: "Rendah",
      medium: "Menengah",
      high: "Tinggi"
    };

    const priority = document.createElement("span");
    priority.className = `priority-badge priority-${priorityValue}`;
    priority.textContent =
      `Prioritas ${priorityLabels[priorityValue]}`;

    const dueDate = document.createElement("p");
    dueDate.className =
      `task-deadline deadline-${deadlineStatus}`;
    dueDate.textContent = getDeadlineLabel(task);

    info.append(title, description, priority, dueDate);

    const status = document.createElement("span");
    status.className = task.completed
      ? "status completed"
      : "status";
    status.textContent = task.completed ? "Selesai" : "Belum";

    // Tombol ubah status.
    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "task-action";
    toggleButton.textContent = task.completed
      ? "Batalkan"
      : "Selesaikan";

    toggleButton.addEventListener("click", async () => {
      toggleButton.disabled = true;

      try {
        await updateTask(task.id);
      } finally {
        toggleButton.disabled = false;
      }
    });

    // Tombol edit.
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "task-action";
    editButton.textContent = "Edit";

    editButton.addEventListener("click", () => {
      editingTaskId = task.id;

      editTitle.value = task.title;
      editPriority.value = priorityValue;
      editDueDate.value = task.due_date || "";
      editError.textContent = "";

      editModal.hidden = false;
      editTitle.focus();
    });

    // Tombol hapus.
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "task-action";
    deleteButton.textContent = "Hapus";

    deleteButton.addEventListener("click", async () => {
      const confirmed = confirm(
        `Yakin ingin menghapus "${task.title}"?`
      );

      if (confirmed) {
        deleteButton.disabled = true;

        try {
          await deleteTask(task.id);
        } finally {
          deleteButton.disabled = false;
        }
      }
    });

    card.append(
      number,
      info,
      status,
      toggleButton,
      editButton,
      deleteButton
    );

    taskList.append(card);
  });
}

// ========================================
// DASHBOARD STATISTICS
// ========================================

function updateDashboard() {
  const total = allTasks.length;

  const completed = allTasks.filter(
    (task) => Boolean(task.completed)
  ).length;

  const percentage = total === 0
    ? 0
    : Math.round((completed / total) * 100);

  const totalTasksElement =
    document.getElementById("total-tasks");
  const completedTasksElement =
    document.getElementById("completed-tasks");
  const percentageElement =
    document.getElementById("progress-percentage");
  const progressTrack =
    document.getElementById("progress-track");

  if (totalTasksElement) {
    totalTasksElement.textContent = total;
  }

  if (completedTasksElement) {
    completedTasksElement.textContent = completed;
  }

  if (percentageElement) {
    percentageElement.textContent = `${percentage}%`;
  }

  taskCount.textContent = `${completed} dari ${total} tugas selesai`;
  progressBar.style.width = `${percentage}%`;
  progressText.textContent = `${percentage}% progres belajar`;

  if (progressTrack) {
    progressTrack.setAttribute("aria-valuenow", percentage);
  }
}

// ========================================
// CREATE TASK
// ========================================

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = taskInput.value.trim();

  if (!title) {
    errorMessage.textContent = "Judul tugas wajib diisi.";
    return;
  }

  if (title.length > 120) {
    errorMessage.textContent =
      "Judul maksimal 120 karakter.";
    return;
  }

  try {
    const response = await csrfFetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        priority: taskPriority.value,
        due_date: taskDueDate.value || null
      })
    });

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(
          response,
          "Tugas gagal ditambahkan."
        )
      );
    }

    taskInput.value = "";
    taskPriority.value = "medium";
    taskDueDate.value = "";
    errorMessage.textContent = "";

    await loadTasks();
    taskInput.focus();
  } catch (error) {
    errorMessage.textContent = error.message;
    console.error(error);
  }
});

// ========================================
// UPDATE TASK STATUS
// ========================================

async function updateTask(id) {
  try {
    const response = await csrfFetch(`/api/tasks/${id}`, {
      method: "PATCH"
    });

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(
          response,
          "Status tugas gagal diubah."
        )
      );
    }

    await loadTasks();
  } catch (error) {
    errorMessage.textContent = error.message;
    console.error(error);
  }
}

// ========================================
// EDIT TASK
// ========================================

async function editTask(id, title, priority, dueDate) {
  const response = await csrfFetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title,
      priority,
      due_date: dueDate || null
    })
  });

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Tugas gagal diedit.")
    );
  }
}

// ========================================
// DELETE TASK
// ========================================

async function deleteTask(id) {
  try {
    const response = await csrfFetch(`/api/tasks/${id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(response, "Tugas gagal dihapus.")
      );
    }

    await loadTasks();
  } catch (error) {
    errorMessage.textContent = error.message;
    console.error(error);
  }
}

// ========================================
// EDIT MODAL
// ========================================

function closeEditModal() {
  editModal.hidden = true;
  editingTaskId = null;
  editError.textContent = "";
}

closeModalButton.addEventListener("click", closeEditModal);
cancelEditButton.addEventListener("click", closeEditModal);
modalBackdrop.addEventListener("click", closeEditModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !editModal.hidden) {
    closeEditModal();
  }
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (editingTaskId === null) return;

  const title = editTitle.value.trim();

  if (!title) {
    editError.textContent = "Nama tugas wajib diisi.";
    return;
  }

  if (title.length > 120) {
    editError.textContent =
      "Judul maksimal 120 karakter.";
    return;
  }

  const submitButton = editForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;
  submitButton.textContent = "Menyimpan...";
  editError.textContent = "";

  try {
    await editTask(
      editingTaskId,
      title,
      editPriority.value,
      editDueDate.value
    );

    closeEditModal();
    await loadTasks();
  } catch (error) {
    editError.textContent = error.message;
    console.error(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Simpan perubahan";
  }
});

// ========================================
// SEARCH, FILTER, SORT
// ========================================

searchInput.addEventListener("input", renderTasks);
taskFilter.addEventListener("change", renderTasks);

const taskSort = document.getElementById("task-sort");

if (taskSort) {
  taskSort.addEventListener("change", renderTasks);
}

// ========================================
// START TASKFLOW & LOGOUT
// ========================================

async function startTaskFlow() {
  try {
    const response = await fetch("/api/me");
    const data = await response.json();

    if (!response.ok || !data.user) {
      window.location.replace("/login.html");
      return;
    }

    // Ambil token baru untuk sesi yang sudah login.
    await refreshCsrfToken(true);

    // Tampilkan nama akun yang sedang login.
    const profileName =
      document.querySelector(".profile-info strong");
    const profileDescription =
      document.querySelector(".profile-info span");
    const profileAvatar =
      document.querySelector(".profile-avatar");

    if (profileName) {
      profileName.textContent = data.user.name;
    }

    if (profileDescription) {
      profileDescription.textContent = data.user.email;
    }

    if (profileAvatar) {
      profileAvatar.textContent = data.user.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
    }

    // Buat tombol logout di bagian profil.
    const profile = document.querySelector(".profile");

    if (profile && !document.getElementById("logout-button")) {
      const logoutButton = document.createElement("button");

      logoutButton.id = "logout-button";
      logoutButton.type = "button";
      logoutButton.textContent = "Logout";
      logoutButton.style.cssText = [
        "margin-left:16px",
        "padding:10px 14px",
        "border:1px solid #e3e5ef",
        "border-radius:10px",
        "background:#fff",
        "color:#5144c9",
        "font:600 13px 'DM Sans',sans-serif",
        "cursor:pointer"
      ].join(";");

      logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;

        try {
          const logoutResponse = await csrfFetch(
            "/api/logout",
            {
              method: "POST"
            }
          );

          if (!logoutResponse.ok) {
            throw new Error(
              await getErrorMessage(
                logoutResponse,
                "Logout gagal. Coba lagi."
              )
            );
          }

          window.location.replace("/login.html");
        } catch (error) {
          alert(error.message);
          logoutButton.disabled = false;
        }
      });

      profile.append(logoutButton);
    }

    // Ambil tugas setelah sesi dan token siap.
    await loadTasks();
  } catch (error) {
    console.error("Gagal memulai TaskFlow:", error);
    errorMessage.textContent =
      "Gagal memulai aplikasi. Periksa koneksi server dan CSRF.";
  }
}

startTaskFlow();


/* =========================
   DARK MODE
========================= */


/* =========================
   DARK MODE — FINAL
========================= */


/* =========================
   DARK MODE — TASKFLOW
========================= */

const themeToggle = document.getElementById("theme-toggle");

function applyTheme(theme) {
  const isDark = theme === "dark";

  document.body.classList.toggle("dark-mode", isDark);

  if (themeToggle) {
    themeToggle.textContent = isDark
      ? "☀️ Light Mode"
      : "🌙 Dark Mode";

    themeToggle.setAttribute("aria-pressed", String(isDark));
  }
}

// Ambil tema yang tersimpan.
const savedTheme = localStorage.getItem("taskflow-theme");
applyTheme(savedTheme === "dark" ? "dark" : "light");

// Ganti tema ketika tombol diklik.
themeToggle?.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark-mode")
    ? "light"
    : "dark";

  localStorage.setItem("taskflow-theme", nextTheme);
  applyTheme(nextTheme);
});
