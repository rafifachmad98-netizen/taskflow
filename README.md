# TaskFlow — Task Management App

A full-stack task management application built with JavaScript, Node.js, Express, and SQLite.

TaskFlow allows users to manage their daily tasks through a web interface with authentication and account-specific task storage.

## Features

- User registration and login
- Secure password hashing with bcrypt
- Session-based authentication
- Create, read, update, and delete tasks (CRUD)
- Task isolation between user accounts
- CSRF protection
- Rate limiting for request protection
- SQLite database for persistent storage
- Session persistence using SQLite
- Frontend built with HTML, CSS, and JavaScript

## Tech Stack

**Frontend**
- HTML5
- CSS3
- JavaScript

**Backend**
- Node.js
- Express.js

**Database and Security**
- SQLite
- bcryptjs
- express-session
- connect-sqlite3
- csrf-csrf
- express-rate-limit
- cookie-parser

## Project Structure

```text
taskflow/
├── public/
│   ├── index.html
│   ├── login.html
│   ├── script.js
│   └── style.css
├── server.js
├── package.json
├── package-lock.json
├── taskflow.db
└── sessions.sqlite
```

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

1. Clone this repository.
2. Navigate to the project directory.
3. Install dependencies:

```bash
npm install
```
4. Create a `.env` file in the project root directory and add the following environment variable:

   ```env
   SESSION_SECRET=your_generated_secret_here
   ```

   Generate a secure secret with Node.js:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Copy the generated value after `SESSION_SECRET=` in your `.env` file. Never commit your `.env` file to GitHub.
5. Start the application:

```bash
npm start
```

6. Open your browser and visit:

```text
http://localhost:3000
```

## Environment Variables

Configure the environment variables required by the application before running it. Check `server.js` to identify the exact variable names and requirements.

Do not commit secrets, session keys, or other sensitive configuration values to version control.

## Security Notes

TaskFlow uses password hashing, session-based authentication, CSRF protection, rate limiting, and account-specific task queries.

Security testing should be completed before deploying the application publicly.

## Future Improvements

- Automated tests
- Task search and filtering
- Task deadlines and priorities
- Improved responsive design
- Production deployment

## License

This project is currently licensed under ISC as specified in `package.json`.
