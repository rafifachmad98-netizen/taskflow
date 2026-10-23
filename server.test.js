
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SESSION_SECRET =
  "test-only-secret-for-taskflow-automated-tests-123456";

const app = require("./server.js");

async function startTestServer() {
  const server = app.listen(0);

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function stopTestServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function getCookie(response, cookieName) {
  const cookies = response.headers.getSetCookie();

  const cookie = cookies.find((item) =>
    item.startsWith(`${cookieName}=`)
  );

  return cookie ? cookie.split(";")[0] : null;
}

async function getCsrf(baseUrl, cookieHeader = "") {
  const response = await fetch(`${baseUrl}/api/csrf-token`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });

  assert.equal(response.status, 200);

  const sessionCookie = getCookie(response, "taskflow.sid");
  const csrfCookie = getCookie(response, "taskflow.csrf");
  const data = await response.json();

  const cookies = [cookieHeader, sessionCookie, csrfCookie]
    .filter(Boolean)
    .join("; ")
    .split("; ")
    .filter((value, index, array) => {
      const name = value.split("=")[0];
      return array.findIndex((item) =>
        item.startsWith(`${name}=`)
      ) === index;
    })
    .join("; ");

  return {
    token: data.csrfToken,
    cookies,
  };
}

async function postJson(baseUrl, path, body, csrf) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf.token,
      Cookie: csrf.cookies,
    },
    body: JSON.stringify(body),
  });
}

test("TaskFlow: registrasi, login, dan session bekerja", async () => {
  const { server, baseUrl } = await startTestServer();

  // Email unik untuk setiap proses test.
  const email = `test-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}@example.com`;

  const password = "TestPassword123";

  try {
    // Ambil token CSRF sebelum registrasi.
    const registerCsrf = await getCsrf(baseUrl);

    const registerResponse = await postJson(
      baseUrl,
      "/api/register",
      {
        name: "Test TaskFlow",
        email,
        password,
      },
      registerCsrf
    );

    assert.equal(registerResponse.status, 201);

    const registerData = await registerResponse.json();
    assert.equal(registerData.user.email, email);

    // Pastikan session hasil registrasi berlaku.
    const sessionCookie = getCookie(
      registerResponse,
      "taskflow.sid"
    );

    assert.ok(sessionCookie, "Cookie session harus tersedia");

    const meResponse = await fetch(`${baseUrl}/api/me`, {
      headers: {
        Cookie: sessionCookie,
      },
    });

    assert.equal(meResponse.status, 200);

    const meData = await meResponse.json();
    assert.equal(meData.user.email, email);

    // Logout untuk memastikan pengujian login berdiri sendiri.
    const logoutCsrf = await getCsrf(baseUrl, sessionCookie);

    const logoutResponse = await postJson(
      baseUrl,
      "/api/logout",
      {},
      logoutCsrf
    );

    assert.equal(logoutResponse.status, 200);

    // Login menggunakan akun yang baru dibuat.
    const loginCsrf = await getCsrf(baseUrl);

    const loginResponse = await postJson(
      baseUrl,
      "/api/login",
      { email, password },
      loginCsrf
    );

    assert.equal(loginResponse.status, 200);

    const loginData = await loginResponse.json();
    assert.equal(loginData.user.email, email);

    const loginSession = getCookie(
      loginResponse,
      "taskflow.sid"
    );

    assert.ok(loginSession, "Login harus membuat session");

    const loggedInResponse = await fetch(
      `${baseUrl}/api/me`,
      {
        headers: {
          Cookie: loginSession,
        },
      }
    );

    assert.equal(loggedInResponse.status, 200);

    const loggedInData = await loggedInResponse.json();
    assert.equal(loggedInData.user.email, email);
  } finally {
    await stopTestServer(server);
  }
});


test("TaskFlow: CRUD task bekerja dan task terisolasi per pengguna", async () => {
    const { server, baseUrl } = await startTestServer();
  
    const email = `crud-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}@example.com`;
  
    let sessionCookie = "";
  
    try {
      // 1. REGISTER: buat akun khusus untuk tes
      const registerCsrf = await getCsrf(baseUrl);
  
      const registerResponse = await postJson(
        baseUrl,
        "/api/register",
        {
          name: "CRUD Test",
          email,
          password: "TestPassword123",
        },
        registerCsrf
      );
  
      assert.equal(registerResponse.status, 201);
  
      sessionCookie =
        getCookie(registerResponse, "taskflow.sid") || "";
  
      assert.ok(sessionCookie, "Session registrasi harus tersedia");
  
      // 2. READ: pastikan daftar task bisa diambil
      const listResponse = await fetch(`${baseUrl}/api/tasks`, {
        headers: { Cookie: sessionCookie },
      });
  
      assert.equal(listResponse.status, 200);
  
      const initialTasks = await listResponse.json();
      assert.ok(Array.isArray(initialTasks));
  
      // 3. CREATE: buat task baru dengan token CSRF valid
      const createCsrf = await getCsrf(baseUrl, sessionCookie);
  
      const createResponse = await postJson(
        baseUrl,
        "/api/tasks",
        {
          title: "Task otomatis untuk pengujian",
          priority: "high",
          due_date: "2027-12-31",
        },
        createCsrf
      );
  
      assert.equal(createResponse.status, 201);
  
      const createdTask = await createResponse.json();
  
      assert.ok(createdTask.id);
      assert.equal(createdTask.title, "Task otomatis untuk pengujian");
      assert.equal(createdTask.priority, "high");
      assert.equal(createdTask.due_date, "2027-12-31");
      assert.equal(createdTask.completed, false);
  
      // 4. READ: pastikan task baru muncul di daftar
      const readResponse = await fetch(`${baseUrl}/api/tasks`, {
        headers: { Cookie: sessionCookie },
      });
  
      assert.equal(readResponse.status, 200);
  
      const tasks = await readResponse.json();
  
      assert.ok(
        tasks.some((task) => task.id === createdTask.id),
        "Task yang baru dibuat harus muncul di daftar"
      );
  
      // 5. UPDATE: ubah judul dan status task
      const updateCsrf = await getCsrf(baseUrl, sessionCookie);
  
      const updateResponse = await fetch(
        `${baseUrl}/api/tasks/${createdTask.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": updateCsrf.token,
            Cookie: updateCsrf.cookies,
          },
          body: JSON.stringify({
            title: "Task berhasil diperbarui",
            completed: true,
          }),
        }
      );
  
      assert.equal(updateResponse.status, 200);
  
      const updatedTask = await updateResponse.json();
  
      assert.equal(updatedTask.title, "Task berhasil diperbarui");
      assert.equal(updatedTask.completed, true);
  
      // 6. DELETE: hapus task yang dibuat oleh tes ini
      const deleteCsrf = await getCsrf(baseUrl, sessionCookie);
  
      const deleteResponse = await fetch(
        `${baseUrl}/api/tasks/${createdTask.id}`,
        {
          method: "DELETE",
          headers: {
            "X-CSRF-Token": deleteCsrf.token,
            Cookie: deleteCsrf.cookies,
          },
        }
      );
  
      assert.equal(deleteResponse.status, 200);
  
      // Pastikan task uji sudah tidak ada
      const finalResponse = await fetch(`${baseUrl}/api/tasks`, {
        headers: { Cookie: sessionCookie },
      });
  
      assert.equal(finalResponse.status, 200);
  
      const finalTasks = await finalResponse.json();
  
      assert.ok(
        !finalTasks.some((task) => task.id === createdTask.id),
        "Task yang dihapus tidak boleh muncul lagi"
      );
    } finally {
      await stopTestServer(server);
    }
  });
  
  test("TaskFlow: pengguna tanpa login tidak bisa membaca task", async () => {
    const { server, baseUrl } = await startTestServer();
  
    try {
      const response = await fetch(`${baseUrl}/api/tasks`);
  
      assert.equal(response.status, 401);
  
      const data = await response.json();
  
      assert.equal(
        data.message,
        "Silakan login terlebih dahulu."
      );
    } finally {
      await stopTestServer(server);
    }
  });

  
test("TaskFlow: pengguna tidak bisa mengubah atau menghapus task pengguna lain", async () => {
    const { server, baseUrl } = await startTestServer();
  
    const unique = `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
  
    const accounts = [
      {
        name: "User A",
        email: `user-a-${unique}@example.com`,
        password: "TestPassword123",
      },
      {
        name: "User B",
        email: `user-b-${unique}@example.com`,
        password: "TestPassword123",
      },
    ];
  
    async function registerAccount(account) {
      const csrf = await getCsrf(baseUrl);
  
      const response = await postJson(
        baseUrl,
        "/api/register",
        account,
        csrf
      );
  
      assert.equal(response.status, 201);
  
      const session = getCookie(response, "taskflow.sid");
      assert.ok(session, "Session akun harus tersedia");
  
      return session;
    }
  
    try {
      // Buat dua akun yang terpisah.
      const sessionA = await registerAccount(accounts[0]);
      const sessionB = await registerAccount(accounts[1]);
  
      // Akun A membuat task miliknya.
      const csrfA = await getCsrf(baseUrl, sessionA);
  
      const createResponse = await postJson(
        baseUrl,
        "/api/tasks",
        {
          title: "Task privat milik User A",
          priority: "medium",
        },
        csrfA
      );
  
      assert.equal(createResponse.status, 201);
  
      const taskA = await createResponse.json();
      assert.ok(taskA.id);
  
      // Akun B mencoba mengubah task milik A.
      const csrfB = await getCsrf(baseUrl, sessionB);
  
      const updateResponse = await fetch(
        `${baseUrl}/api/tasks/${taskA.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfB.token,
            Cookie: csrfB.cookies,
          },
          body: JSON.stringify({
            title: "Diubah oleh User B",
          }),
        }
      );
  
      assert.equal(
        updateResponse.status,
        404,
        "User B tidak boleh mengubah task milik User A"
      );
  
      // Akun B mencoba menghapus task milik A.
      const deleteCsrf = await getCsrf(baseUrl, sessionB);
  
      const deleteResponse = await fetch(
        `${baseUrl}/api/tasks/${taskA.id}`,
        {
          method: "DELETE",
          headers: {
            "X-CSRF-Token": deleteCsrf.token,
            Cookie: deleteCsrf.cookies,
          },
        }
      );
  
      assert.equal(
        deleteResponse.status,
        404,
        "User B tidak boleh menghapus task milik User A"
      );
  
      // Pastikan task A masih ada dan judulnya tidak berubah.
      const verifyResponse = await fetch(
        `${baseUrl}/api/tasks`,
        {
          headers: {
            Cookie: sessionA,
          },
        }
      );
  
      assert.equal(verifyResponse.status, 200);
  
      const tasksA = await verifyResponse.json();
  
      const originalTask = tasksA.find(
        (task) => task.id === taskA.id
      );
  
      assert.ok(
        originalTask,
        "Task User A harus tetap ada"
      );
  
      assert.equal(
        originalTask.title,
        "Task privat milik User A"
      );
    } finally {
      await stopTestServer(server);
    }
  });
  
  