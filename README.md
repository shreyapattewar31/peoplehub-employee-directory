# Employee Directory System

A full-stack employee directory for managing employee records. The application uses React for the admin interface, Express for the REST API, and MySQL for persistent storage.

## Features

- Account registration, login, logout, and persistent secure sessions
- Administrator and read-only member roles with server-side authorization
- Admin-only employee creation, editing, and deletion
- Persistent audit/activity log for account access and employee changes
- Activity filtering, search, and pagination for administrators
- Protected employee directory for signed-in accounts
- Add/edit forms with client-side and server-side validation
- Unique email enforcement with a clear conflict response
- Search by name, email, or phone
- Department filtering, sorting, and employee pagination
- Loading, empty, error, and success feedback
- Confirmation dialog before deleting an employee
- Responsive layout and accessible dialogs
- Parameterized SQL queries to prevent SQL injection
- Automated validation and API contract tests

## Tech stack

- **Frontend:** React 18, Vite, plain CSS
- **Backend:** Node.js, Express
- **Database:** MySQL 8 with `mysql2/promise`
- **API:** REST over JSON, consumed with `fetch`

## Project structure

```text
employee-directory-system/
├── backend/
│   ├── scripts/
│   │   └── setupDatabase.js
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auditLogs.js
│   │   │   ├── auth.js
│   │   │   └── employees.js
│   │   ├── app.js
│   │   ├── audit.js
│   │   ├── auth.js
│   │   ├── authValidation.js
│   │   ├── config.js
│   │   ├── db.js
│   │   └── validation.js
│   ├── tests/
│   └── .env.example
├── database/
│   └── schema.sql
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── AuthContext.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   └── .env.example
├── package.json
└── README.md
```

## Prerequisites

- Node.js 18 or newer
- npm 9 or newer
- MySQL 8 running locally or accessible over the network
- A MySQL user with permission to create a database and tables

## Installation and setup

### 1. Install dependencies

From the project root:

```bash
npm install
```

The root workspace installs both backend and frontend dependencies.

### 2. Configure environment variables

Copy the backend example file:

```bash
cp backend/.env.example backend/.env
```

On Windows PowerShell, use:

```powershell
Copy-Item backend/.env.example backend/.env
```

Update `backend/.env` with your MySQL credentials:

```env
NODE_ENV=development
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=employee_directory
CLIENT_ORIGIN=http://localhost:5173
```

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment; enables secure cookies in production | `development` |
| `PORT` | Express server port | `4000` |
| `DB_HOST` | MySQL hostname | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | Empty |
| `DB_NAME` | Database name | `employee_directory` |
| `CLIENT_ORIGIN` | Frontend origin allowed by CORS | `http://localhost:5173` |

The backend `.env` file is ignored by Git. Do not commit real credentials.

The optional `frontend/.env.example` contains:

```env
VITE_API_BASE_URL=/api
```

The default `/api` path is proxied to the Express server by Vite, so no frontend environment file is required for local development.

### 3. Create the database and table

Run the setup script:

```bash
npm run db:setup
```

This creates the configured database and the `employees`, `users`, `sessions`, and `audit_logs` tables. It is safe to run again because the script uses `IF NOT EXISTS`. Run this command after updating an existing installation: it also adds the `users.role` column when missing and promotes the oldest account to administrator if no administrator exists.

Alternatively, import the schema directly with the MySQL CLI when creating a fresh database:

```bash
mysql -u root -p < database/schema.sql
```

Use `npm run db:setup`, rather than only importing the schema, when upgrading an older installation that already has a `users` table.

### 4. Start the development servers

```bash
npm run dev
```

This starts:

- React frontend: `http://localhost:5173`
- Express API: `http://localhost:4000`
- API health check: `http://localhost:4000/api/health`

The API checks the database connection before starting. If MySQL is not reachable, fix the connection settings in `backend/.env` and try again.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the frontend and backend together |
| `npm run dev:client` | Start only the React development server |
| `npm run dev:server` | Start only the Express API with auto-restart |
| `npm run db:setup` | Create or upgrade the database, employee, account, session, and audit tables |
| `npm test` | Run backend validation and API contract tests |
| `npm run build` | Create the optimized frontend build |
| `npm start` | Start Express and serve the built frontend |

## Database schema

The `employees` table is created by `database/schema.sql`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `INT UNSIGNED` | Auto-increment primary key |
| `name` | `VARCHAR(100)` | Required |
| `email` | `VARCHAR(255)` | Required, unique, case-insensitive by default MySQL collation |
| `phone` | `VARCHAR(20)` | Required |
| `department` | `VARCHAR(100)` | Required, indexed |
| `designation` | `VARCHAR(100)` | Required |
| `salary` | `DECIMAL(12,2)` | Required, non-negative, maximum two decimal places |
| `joining_date` | `DATE` | Required |
| `created_at` | `TIMESTAMP` | Set automatically by MySQL |

Authentication and auditing use three additional tables:

| Table | Key columns | Purpose |
| --- | --- | --- |
| `users` | `id`, `name`, `email`, `password_hash`, `role`, `created_at` | Stores registered accounts, bcrypt password hashes, and `admin` or `user` roles |
| `sessions` | `token_hash`, `user_id`, `expires_at`, `created_at` | Stores hashed session tokens with a seven-day expiry |
| `audit_logs` | `user_id`, `user_name`, `user_email`, `action`, `entity_type`, `entity_id`, `summary`, `details`, `ip_address`, `created_at` | Stores a permanent record of account access and employee changes |

Passwords are never returned by the API. Session tokens are stored as SHA-256 hashes, and deleting a session immediately invalidates it. Audit actor names and email addresses are stored as snapshots so history remains readable if the related account is later removed.

## Accounts and sessions

Open the frontend and select **Create account** if you do not have an account. Registration signs you in immediately; otherwise, sign in with your email and password. Use either **Sign out** button to end the session.

- The first registered account becomes an administrator. Later accounts are read-only members. When upgrading an existing installation, the oldest account is promoted if no administrator exists.
- Administrators can create, edit, and delete employees and can open **Activity log**.
- Read-only members can browse, search, filter, sort, and paginate employees, but cannot change records or open the activity log.
- Sessions last seven days and survive page refreshes.
- The browser receives an HttpOnly, SameSite=Lax session cookie. Tokens are not stored in local storage.
- Login and registration are limited to 20 attempts per IP address in a 15-minute window.
- All employee endpoints require a valid session. An expired or missing session returns `401`, and the frontend returns to the sign-in page.
- Employee write endpoints and the audit-log endpoint require the `admin` role. A signed-in member receives `403 Forbidden`; authorization is enforced by the API, not only by hidden interface controls.

## REST API

All request and response bodies use JSON unless noted otherwise.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account and start a session |
| `POST` | `/api/auth/login` | Sign in and start a session |
| `GET` | `/api/auth/me` | Get the signed-in account |
| `POST` | `/api/auth/logout` | Invalidate the session and clear the cookie |
| `GET` | `/api/health` | Check API and database availability |
| `GET` | `/api/employees/departments` | List distinct departments |
| `GET` | `/api/employees` | List employees with filters and pagination |
| `GET` | `/api/employees/:id` | Get one employee |
| `POST` | `/api/employees` | Create an employee (admin only) |
| `PUT` | `/api/employees/:id` | Replace an employee record (admin only) |
| `PATCH` | `/api/employees/:id` | Partially update an employee record (admin only) |
| `DELETE` | `/api/employees/:id` | Delete an employee (admin only) |
| `GET` | `/api/audit-logs` | List activity with filters and pagination (admin only) |

### Authentication example

Use a cookie jar when testing protected endpoints from the command line:

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Avery Morgan",
    "email": "avery@example.com",
    "password": "Directory2026"
  }'

curl -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "avery@example.com",
    "password": "Directory2026"
  }'

curl -b cookies.txt http://localhost:4000/api/auth/me

curl -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/logout
```

Registration requires a name of 2–100 characters, a valid email, and a password of at least eight characters containing a letter and a number. The registration example creates an administrator only when it is the first account in a fresh database; otherwise it creates a read-only member. Browser requests send the session cookie automatically. API clients must retain and resend the returned cookie for every protected request.

### List query parameters

```text
GET /api/employees?page=1&limit=10&search=Avery&department=Engineering&sortBy=name&sortOrder=asc
```

- `page`: positive integer, default `1`
- `limit`: integer from `1` to `100`, default `10`
- `search`: matches name, email, or phone
- `department`: exact department match
- `sortBy`: `name`, `email`, `department`, `designation`, `salary`, or `joining_date`
- `sortOrder`: `asc` or `desc`

Example list response:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Avery Morgan",
      "email": "avery@example.com",
      "phone": "+1 (415) 555-0132",
      "department": "Engineering",
      "designation": "Software Engineer",
      "salary": 95000.5,
      "joining_date": "2026-11-01",
      "created_at": "2026-11-24 10:00:00"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### Audit-log query parameters

```text
GET /api/audit-logs?page=1&limit=10&action=employee.updated&entityType=employee&search=Avery
```

- `page`: positive integer, default `1`
- `limit`: integer from `1` to `100`, default `10`
- `action`: `account.registered`, `auth.login`, `auth.logout`, `employee.created`, `employee.updated`, or `employee.deleted`
- `entityType`: `account` or `employee`
- `search`: matches the activity summary or the actor's name/email

Results are returned newest first with the same `data` and `pagination` structure as the employee list. Use an administrator's `cookies.txt` file when testing this endpoint.

### Activity log behavior

Registration, login, logout, employee creation, employee updates, and employee deletion are recorded in MySQL. Employee update entries include the changed field names and before/after values. On a live MySQL connection, the data change and its audit entry are committed in the same transaction, so an audit failure rolls back the change. Audit records are retained permanently unless an administrator removes them directly from the database.

### Create example

The following request requires an administrator session:

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/employees \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Avery Morgan",
    "email": "avery@example.com",
    "phone": "+1 (415) 555-0132",
    "department": "Engineering",
    "designation": "Software Engineer",
    "salary": 95000.50,
    "joining_date": "2026-11-01"
  }'
```

### HTTP status codes and errors

- `200 OK`: successful read or update
- `201 Created`: employee created
- `204 No Content`: employee deleted
- `400 Bad Request`: invalid body, query parameter, ID, or field value
- `401 Unauthorized`: missing, invalid, or expired session
- `403 Forbidden`: the signed-in account does not have administrator access
- `404 Not Found`: employee or endpoint does not exist
- `409 Conflict`: email already belongs to another account or employee
- `429 Too Many Requests`: login or registration attempt limit reached
- `413 Payload Too Large`: request body exceeds 100 KB
- `500 Internal Server Error`: unexpected server failure
- `503 Service Unavailable`: database connection failure

Validation errors are returned by field:

```json
{
  "error": "Validation failed.",
  "errors": {
    "email": "Enter a valid email address."
  }
}
```

## Production build

1. Build the frontend:

   ```bash
   npm run build
   ```

2. Ensure `backend/.env` contains the production database credentials, set `CLIENT_ORIGIN` to the public frontend origin, and set `NODE_ENV=production`.

3. Serve the application over HTTPS in production. The `Secure` cookie flag is enabled when `NODE_ENV=production`, so session cookies are only sent over secure connections.

4. Start the production server:

   ```bash
   npm start
   ```

Express serves the built React files and the API from the same origin at `http://localhost:4000`. If the frontend is hosted separately, set `VITE_API_BASE_URL` to the full API base URL before running `npm run build`.

The SQL sort column and sort direction are allowlisted, and all employee values are passed to MySQL as query parameters.

## Tests

```bash
npm test
```

The test suite uses Node's built-in test runner. It validates account and employee input and exercises authentication, role authorization, audit logging, and CRUD routes against a mock database, including password hashing, session cookies, protected endpoints, member denial, pagination, audit filters, duplicate emails, updates, deletes, and missing employees. A live MySQL server is not required to run these tests.

## Troubleshooting

### `Unable to start the server`

- Confirm MySQL is running.
- Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `backend/.env`.
- Run `npm run db:setup` before starting the API.

### `Database setup failed: Access denied`

Use a MySQL account with permission to create databases and tables, or create the database first and grant the required permissions to your application user.

### Frontend loads but the employee list shows a connection error

- Confirm the API is running on port `4000`.
- Visit `http://localhost:4000/api/health`.
- Keep the default `VITE_API_BASE_URL=/api` when using the Vite development proxy.

### Sign-in or registration reports a database table error

Run `npm run db:setup` to create or upgrade the `users`, `sessions`, and `audit_logs` tables, then restart the backend. Existing employee records are not changed.

### Employee changes or Activity log return `403 Forbidden`

Sign in with an administrator account. Later registrations are read-only members by design. On an upgraded installation, `npm run db:setup` promotes the oldest account if no administrator exists.

### Port already in use

Change `PORT` in `backend/.env` and set `VITE_API_PROXY_TARGET=http://localhost:<new-port>` in `frontend/.env` for development. Restart both processes after changing environment variables.
