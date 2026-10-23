# TaskFlow — Full-Stack Task Manager

TaskFlow is a full-stack task management application built to practice and demonstrate front-end and back-end web development.

Users can register, log in, manage personal tasks, set priorities and deadlines, track progress, and switch between light and dark themes.

## Features

- **Authentication:** User registration, login, and logout.
- **Session management:** Persistent sessions using SQLite-backed storage.
- **Task management:** Create, read, update, and delete tasks.
- **Task organization:** Priorities, deadlines, search, filtering, and sorting.
- **Dashboard:** Task progress tracking.
- **Dark mode:** Theme preference saved in the browser.
- **Security:** Password hashing, request validation, rate limiting, session protection, and CSRF protection.
- **Automated testing:** Tests for authentication, task operations, access control, and user task isolation.

## Tech Stack

**Frontend**
- HTML
- CSS
- JavaScript

**Backend**
- Node.js
- Express.js
- SQLite

**Security and supporting libraries**
- bcryptjs
- express-session
- connect-sqlite3
- express-rate-limit
- cookie-parser
- csrf-csrf

## Prerequisites

Install Node.js and npm before running the application.

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/rafifachmad98-netizen/taskflow.git
   ```

2. Open the project directory:

   ```bash
   cd taskflow
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create a `.env` file in the project root and add a strong session secret:

   ```env
   SESSION_SECRET=replace-with-your-own-random-secret
   ```

   Use a randomly generated secret of at least 32 characters. Never commit your real `.env` file to GitHub.

5. Start the application:

   ```bash
   npm start
   ```

6. Open the application in your browser:

   http://localhost:3000

## Running Automated Tests

Run the test suite with:

```bash
npm test
```

The automated tests cover registration, login, session handling, task CRUD operations, unauthenticated access restrictions, and task ownership isolation.

## Project Structure

```text
taskflow/
├── public/
│   ├── index.html
│   ├── login.html
│   ├── script.js
│   └── style.css
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
├── server.js
└── server.test.js
```

The SQLite databases are created locally and should not be committed to the repository.

## Learning Goals

This project was built to practice:

- Building responsive web interfaces.
- Working with JavaScript and DOM events.
- Designing REST-style API endpoints.
- Managing authentication and sessions.
- Performing database operations with SQLite.
- Applying basic web security protections.
- Writing automated tests with Node.js.

## Status

The application and its current automated test suite are running locally. Development and testing are ongoing.

## Author

**Rafif Achmad**

GitHub: [@rafifachmad98-netizen](https://github.com/rafifachmad98-netizen)