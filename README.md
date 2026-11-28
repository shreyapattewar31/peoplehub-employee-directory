# Employee Directory System

A full-stack employee directory for managing employee records. The application uses React for the admin interface, Express for the REST API, and MySQL for persistent storage.

## Features

- Account registration, login, logout, and persistent secure sessions
- Administrator and employee roles with server-side, admin-only employee data access
- Admin-only employee creation, editing, deletion, and private employee photos
- Direct employee onboarding with saved drafts, required Aadhaar/PAN/bank-book uploads, and approval-gated sign-in
- Private Cloudinary document storage with administrator verification, check marks, and authenticated downloads
- Admin-configured Google Form link with automatic, duplicate-safe legacy imports
- Geolocation-validated attendance punch-in/out and employee leave requests with administrator decisions
- Persistent audit/activity log plus filterable operational system logs
- Activity filtering, search, and pagination for administrators
- Configurable IANA time zone, date format, and 12/24-hour time with a live preview
- Environment-backed SMTP configuration and administrator test email
- Cloudflare Turnstile and centralized rate limits on browser forms and actions
- Safe local drafts that retain non-sensitive form values after errors
- Dismissible success/error notifications and field-level server error messages
- Validated JPEG, PNG, and WebP uploads with size/dimension guidance
- Administrator-only JSON/CSV backups with explicit secret exclusion
- Protected employee directory and dashboard for administrators only
- Add/edit forms with client-side and server-side validation
- Unique email enforcement with a clear conflict response
- Search by name, email, or phone
- Department filtering, sorting, and employee pagination
- Loading, empty, error, and success feedback
- Confirmation dialog before deleting an employee
- Responsive layout, mobile navigation/cards, and accessible dialogs
- Standard shared URL builders for API, public links, photos, and onboarding
- UTC database timestamps returned as ISO-8601 values
- Parameterized SQL queries to prevent SQL injection
- Automated validation and API contract tests

## Tech stack

- **Frontend:** React 18, Vite, plain CSS
- **Backend:** Node.js, Express
- **Database:** MySQL 8 with `mysql2/promise`
- **API:** REST over JSON, consumed with `fetch`
- **Security:** bcrypt, HttpOnly sessions, Cloudflare Turnstile, `express-rate-limit`
- **Email:** `nodemailer` with SMTP settings loaded from the server environment
- **Images:** `multer` and `sharp` validation, metadata stripping, and WebP conversion
- **Cloudinary:** private onboarding documents and production employee photos with administrator-authorized delivery
- **Google Forms:** Google Apps Script form-submit trigger and secured webhook

## Project structure

```text
employee-directory-system/
├── backend/
│   ├── scripts/
│   │   └── setupDatabase.js
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── errorHandler.js
│   │   │   └── rateLimiters.js
│   │   ├── routes/
│   │   │   ├── admin.js
│   │   │   ├── auditLogs.js
│   │   │   ├── auth.js
│   │   │   ├── employees.js
│   │   │   └── onboarding.js
│   │   ├── services/
│   │   │   ├── employeePhotos.js
│   │   │   └── mail.js
│   │   ├── utils/
│   │   │   ├── employees.js
│   │   │   ├── time.js
│   │   │   └── url.js
│   │   ├── app.js
│   │   ├── audit.js
│   │   ├── auth.js
│   │   ├── authValidation.js
│   │   ├── turnstile.js
│   │   ├── config.js
│   │   ├── db.js
│   │   ├── logger.js
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
PUBLIC_APP_URL=http://localhost:5173
APP_TIMEZONE=UTC
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
TURNSTILE_ALLOWED_HOSTNAMES=localhost,127.0.0.1

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
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
| `PUBLIC_APP_URL` | Canonical public app URL used for shared onboarding links | `CLIENT_ORIGIN` |
| `APP_TIMEZONE` | Valid IANA environment time zone and initial admin display setting | `UTC` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile server secret; required in production | Always-pass test secret in development |
| `TURNSTILE_ALLOWED_HOSTNAMES` | Comma-separated hostnames accepted from Siteverify | `CLIENT_ORIGIN` and `PUBLIC_APP_URL` hostnames |
| `SMTP_HOST` | SMTP server hostname; empty disables email configuration | Empty |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_SECURE` | Use implicit TLS when `true` | `false` |
| `SMTP_USER` | SMTP username, if required | Empty |
| `SMTP_PASSWORD` | SMTP password, if required | Empty |
| `SMTP_FROM` | Sender address; falls back to `SMTP_USER` | Empty |

Database, SMTP, Turnstile, and webhook secrets stay on the server and are never included in browser settings or backups. The Turnstile site key is public and belongs only in the frontend environment.

The backend `.env` file is ignored by Git. Do not commit real credentials.

The optional `frontend/.env.example` contains:

```env
VITE_API_BASE_URL=/api
VITE_PUBLIC_APP_URL=http://localhost:5173
VITE_API_PROXY_TARGET=http://localhost:4000
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

The default `/api` path is proxied to the Express server by Vite, so no frontend environment file is required for local development. Use a full HTTPS `VITE_API_BASE_URL` when the frontend is hosted separately. `VITE_PUBLIC_APP_URL` is optional and defaults to the current browser origin.

#### Cloudflare Turnstile

Local development uses Cloudflare's visible always-pass test site key and test secret. The backend also falls back to the test secret when `NODE_ENV` is not `production`.

For production, create a Turnstile widget in Cloudflare, add the real hostnames to the widget, set `VITE_TURNSTILE_SITE_KEY` in the frontend environment before building, and set `TURNSTILE_SECRET_KEY` in `backend/.env`. Set `TURNSTILE_ALLOWED_HOSTNAMES` to the exact browser hostnames accepted by Siteverify. Never deploy Cloudflare test keys in production; the backend rejects them when `NODE_ENV=production`.

The browser sends the token as `cf-turnstile-response`. The API validates it with Cloudflare's Siteverify endpoint on every protected form, rejects expired/reused tokens, checks the returned hostname, and fails closed if Cloudflare is unavailable. Tokens are single-use and expire after five minutes, so the widget resets after submission errors. See the official [testing keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) and [server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) documentation.

### 3. Create the database and table

Run the setup script:

```bash
npm run db:setup
```

This creates the configured database and the `employees`, `users`, `sessions`, `audit_logs`, `system_logs`, `app_settings`, and `onboarding_submissions` tables. It is safe to run again because the script uses `IF NOT EXISTS` and additive column checks. Run this command after updating an existing installation: it adds missing photo/timestamp columns, adds `users.role` and `users.updated_at` when needed, creates the operational log table, and promotes the oldest account to administrator if no administrator exists.

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
| `npm run db:setup` | Create or upgrade employee, account, session, audit, system-log, settings, photo, and timestamp storage |
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
| `photo_path` | `VARCHAR(255)` | Private randomized WebP filename, or `NULL` |
| `created_at` | `TIMESTAMP` | Set automatically by MySQL |
| `updated_at` | `TIMESTAMP` | Updated automatically when the row changes |

Authentication, auditing, settings, logs, and Google Forms imports use six additional tables:

| Table | Key columns | Purpose |
| --- | --- | --- |
| `users` | `id`, `name`, `email`, `password_hash`, `role`, `created_at`, `updated_at` | Stores registered accounts, bcrypt password hashes, and `admin` or `user` roles |
| `sessions` | `token_hash`, `user_id`, `expires_at`, `created_at` | Stores hashed session tokens with a seven-day expiry |
| `audit_logs` | `user_id`, `user_name`, `user_email`, `action`, `entity_type`, `entity_id`, `summary`, `details`, `ip_address`, `created_at` | Stores a permanent record of account access, employee changes, settings, email tests, and exports |
| `system_logs` | `level`, `event`, `message`, `context`, `user_id`, `ip_address`, `created_at` | Stores recent operational errors/events separately from permanent business history |
| `app_settings` | `setting_key`, `setting_value`, `updated_at` | Stores the private webhook token, saved Google Form URL, and admin display preferences |
| `onboarding_submissions` | `response_id`, `employee_id`, `employee_email`, `created_at` | Tracks processed Google Form responses to prevent duplicate imports |

Database sessions use UTC, and timestamp fields are serialized as ISO-8601 values. Passwords are never returned by the API. Session tokens are stored as SHA-256 hashes, and deleting a session immediately invalidates it. Audit actor names and email addresses are stored as snapshots so history remains readable if the related account is later removed.

## Accounts and sessions

Open the frontend and select **Create account** if you do not have an account. Standard registration signs you in immediately; otherwise, sign in with your email and password. Use the **Sign out** button to end the session.

- The first registered account becomes an administrator. Later accounts are employee accounts. When upgrading an existing installation, the oldest account is promoted if no administrator exists.
- The employee onboarding link is `/onboarding`; it is a registration-only flow that creates an employee account without signing the employee in or opening the employee directory. A confirmation screen is shown after registration. Create the administrator through standard registration at `/` before sharing this link. Onboarding registration is rejected if no administrator exists, preventing the first employee from accidentally becoming an administrator.
- Administrators can view the dashboard, create, edit, and delete employees, and open **Activity log**.
- Employees can sign in and view only their own account profile. They cannot view employee records, salaries, contact details, departments, or the administration dashboard.
- Sessions last seven days and survive page refreshes.
- The browser receives an HttpOnly, SameSite=Lax session cookie. Tokens are not stored in local storage.
- Login and registration are limited to 20 attempts per IP address in a 15-minute window.
- All employee-data endpoints require a valid administrator session. A missing or expired session returns `401`; a signed-in employee receives `403 Forbidden`. Authorization is enforced by the API, not only by hidden interface controls.

## Google Forms employee onboarding

The administrator **Employee onboarding** button creates a separate Google Forms workflow for adding employee directory records. This is different from `/onboarding`, which creates an employee login account.

### 1. Create and save the Google Form

1. Sign in as an administrator and select **Employee onboarding** beside **Add employee**.
2. Select **Create form** or open [Google Forms](https://docs.google.com/forms/create).
3. Add these seven questions with the exact titles shown and mark every question as required:

   | Question title | Type |
   | --- | --- |
   | Name | Short answer |
   | Email | Short answer |
   | Phone | Short answer |
   | Department | Short answer |
   | Designation | Short answer |
   | Salary | Short answer |
   | Joining date | Date |

4. Publish the form and paste its `https://docs.google.com/forms/...` or `https://forms.gle/...` link into PeopleHub.
5. Select **Save form link**. The normalized HTTPS link is stored on the server and is available to every administrator. **Copy form link** can be used when sharing it with employees.

### 2. Connect the form to PeopleHub

1. In Google Forms, open the three-dot menu and select **Script editor**.
2. Replace the editor contents with the Apps Script provided by the PeopleHub **Employee onboarding** dialog.
3. Save the project, select the `setupPeopleHubOnboarding` function, and select **Run**.
4. Approve the Google authorization prompts. Running the function installs the form-submit trigger.
5. Submit a test response and check the administrator's employee list and **Activity log**.

The script sends each response to the webhook shown in the dialog. That URL must be publicly reachable over HTTPS by Google; `localhost` and a private LAN address will not work. When using an ngrok tunnel, open PeopleHub through the tunnel URL before copying the script so the generated webhook uses the correct public address. If the public URL changes, copy the updated script and run `setupPeopleHubOnboarding` again.

### Import behavior and security

- Valid submissions create an employee record in the directory, not a login account. Use the separate `/onboarding` registration link when the employee also needs an account.
- Employee fields use the same server-side validation and unique-email rules as the admin forms.
- The employee record, processed-response marker, and activity entry are saved in one database transaction.
- Google's response ID makes repeated submissions idempotent; the same response is not imported twice.
- Duplicate email addresses return a conflict instead of creating another employee.
- The webhook requires the private Bearer token generated by PeopleHub. The token is returned only to administrators and is checked before employee data is accessed.
- Share only the Google Form link with employees. Never share the copied Apps Script, webhook URL, or token.
- The directory refreshes automatically every 30 seconds and when the administrator returns to the tab.

## Admin panel

Administrators have four navigation items: **Employees**, **Activity log**, **Settings**, and the employee dashboard header actions.

### Time, date, and timestamps

- Open **Settings → Time and date** to choose an IANA time zone, date format, and 12/24-hour time. The preview updates immediately.
- `APP_TIMEZONE` sets the environment default. Saved administrator preferences override it for browser display and are stored in `app_settings`.
- For India, select `Asia/Kolkata`; for example, `05:52 UTC` displays as `11:22 IST`. The environment default can remain `UTC` because it does not change stored timestamps.
- MySQL stores timestamps in UTC. The API returns ISO-8601 UTC values, while the browser converts them using the selected display settings. Joining dates remain calendar dates and do not shift time zones.

### Email configuration

1. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `backend/.env`.
2. Restart the API.
3. Open **Settings → Email configuration**. The panel shows whether SMTP is configured without exposing credentials.
4. Enter a recipient, complete the security check, and select **Send test email**.

The send button stays disabled until SMTP is configured. Credentials are never returned to the browser or included in exports.

### Notifications, errors, and safe drafts

- Success and failure actions appear in a dismissible notification stack.
- Server validation errors are shown beside their fields. Turnstile errors refresh the widget automatically.
- Employee, authentication, settings, and onboarding-link drafts are retained in browser local storage after validation or request failures and cleared after success.
- Passwords, confirmation passwords, Turnstile tokens, session cookies, and server secrets are never written to drafts.

### Employee photos

The edit form accepts JPEG, PNG, or WebP files up to **2 MB**, with each side between **128 and 4096 px**. The server validates the actual file, strips metadata, applies orientation, and converts it to WebP at no more than 800×800. Development photos are stored under `backend/uploads/employees/`; production photos use private Cloudinary assets so Vercel deployments do not depend on ephemeral disk storage. Photos are served only through an administrator-protected API route. Replacing or deleting a photo removes the old asset; backups contain only a `has_photo` flag, not image files.

### System logs and backups

- **System logs** shows recent operational errors/events with level filters. Permanent account and employee history remains in **Activity log**.
- **Backup and export** downloads employees, activity, system logs, or a full JSON backup. Individual datasets support JSON or CSV; full backups are JSON only.
- Each dataset is limited to 10,000 rows. Exports explicitly exclude accounts, password hashes, sessions, SMTP credentials, Turnstile secrets, webhook tokens, photo paths/files, and other secret settings.
- Export actions are administrator-only, rate-limited, and recorded in Activity log.

### Security and standard URLs

- Cloudflare Turnstile protects registration, login, employee create/edit/delete, photo actions, onboarding-link save, settings save, and test email forms. The server validates every token with Siteverify and checks allowed hostnames.
- Turnstile tokens expire after five minutes and are single-use. Expired, reused, missing, or invalid tokens are rejected before database work; verification outages return a retryable `502`.
- The Google Forms webhook uses its private Bearer token instead of browser Turnstile.
- Rate limits use a 15-minute window: authentication 20 attempts, mutations 120 requests, uploads 30 requests, form submissions 120 requests, and exports/log downloads 20 requests.
- `PUBLIC_APP_URL`, `CLIENT_ORIGIN`, `VITE_API_BASE_URL`, and `VITE_PUBLIC_APP_URL` use shared URL builders so API paths, public links, and photo URLs do not gain duplicate prefixes.
- Saved Google Form links must be HTTPS links on `docs.google.com/forms/...` or `forms.gle/...`; embedded URL credentials are rejected.

### Mobile and pagination

Employee and activity lists support page-size selection and previous/next pagination. On narrow screens, navigation moves into a slide-out menu, employee records become cards, activity uses dedicated mobile cards, settings stack vertically, and notifications remain readable without horizontal page overflow.

## REST API

All request and response bodies use JSON unless noted otherwise.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account and start a session |
| `POST` | `/api/auth/login` | Sign in and start a session |
| `GET` | `/api/auth/me` | Get the signed-in account |
| `POST` | `/api/auth/logout` | Invalidate the session and clear the cookie |
| `GET` | `/api/health` | Check API and database availability |
| `GET` | `/api/onboarding/config` | Get Google Forms integration fields and token (admin only) |
| `POST` | `/api/onboarding/form-link` | Normalize and save the Google Form URL (admin only, Turnstile) |
| `POST` | `/api/onboarding/submissions` | Import an employee from Google Forms using the private Bearer token |
| `POST` | `/api/onboarding/applications` | Create a cookie-protected direct onboarding draft |
| `GET` | `/api/onboarding/applications/:id` | Resume a draft only with its HttpOnly cookie |
| `PATCH` | `/api/onboarding/applications/:id` | Save onboarding profile fields |
| `POST` | `/api/onboarding/applications/:id/documents/:type/sign` | Get signed Cloudinary upload parameters |
| `POST` | `/api/onboarding/applications/:id/documents/:type/complete` | Verify an uploaded private document |
| `POST` | `/api/onboarding/applications/:id/submit` | Submit all required fields/documents for approval (Turnstile) |
| `GET` | `/api/admin/onboarding/applications` | List onboarding applications (admin only) |
| `GET` | `/api/admin/onboarding/applications/:id` | Inspect an application and documents (admin only) |
| `POST` | `/api/admin/onboarding/applications/:id/documents/:type/verify` | Verify a document (admin only) |
| `GET` | `/api/admin/onboarding/applications/:id/documents/:type/download` | Get an expiring private document download (admin only) |
| `POST` | `/api/admin/onboarding/applications/:id/decision` | Approve or reject onboarding (admin only) |
| `GET` | `/api/me` | Get the employee's own profile and today's punches |
| `POST` | `/api/me/attendance/punch` | Punch in/out with validated geolocation |
| `GET` | `/api/me/attendance` | List the employee's punches for up to 31 days |
| `GET` | `/api/me/leave` | List the employee's leave requests |
| `POST` | `/api/me/leave` | Submit a leave request |
| `POST` | `/api/me/leave/:id/cancel` | Cancel a pending leave request |
| `GET` | `/api/admin/workforce/attendance` | Inspect geotagged attendance (admin only) |
| `GET` | `/api/admin/workforce/leave` | List leave requests (admin only) |
| `POST` | `/api/admin/workforce/leave/:id/decision` | Approve or reject leave (admin only) |
| `GET` | `/api/employees/departments` | List distinct departments (admin only) |
| `GET` | `/api/employees` | List employees with filters and pagination (admin only) |
| `GET` | `/api/employees/:id` | Get one employee (admin only) |
| `POST` | `/api/employees` | Create an employee (admin only, Turnstile) |
| `PUT` | `/api/employees/:id` | Replace an employee record (admin only, Turnstile) |
| `PATCH` | `/api/employees/:id` | Partially update an employee record (admin only, Turnstile) |
| `DELETE` | `/api/employees/:id` | Delete an employee and photo (admin only, Turnstile) |
| `GET` | `/api/employees/:id/photo` | Read a private employee photo (admin only) |
| `POST` | `/api/employees/:id/photo` | Upload/replace a photo as multipart `photo` (admin only, Turnstile) |
| `DELETE` | `/api/employees/:id/photo` | Remove an employee photo (admin only, Turnstile) |
| `GET` | `/api/audit-logs` | List activity with filters and pagination (admin only) |
| `GET` | `/api/admin/settings` | Get display, SMTP status, image policy, and public URL settings (admin only) |
| `PUT` | `/api/admin/settings` | Save display settings (admin only, Turnstile) |
| `POST` | `/api/admin/email/test` | Send an SMTP test email (admin only, Turnstile) |
| `GET` | `/api/admin/logs` | List recent system logs with limit/level filters (admin only) |
| `GET` | `/api/admin/backup` | Download a JSON/CSV backup (admin only) |

### Authentication example

Browser forms complete Turnstile automatically. For local command-line testing with Cloudflare's test keys, send the documented dummy token as `cf-turnstile-response`:

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Avery Morgan",
    "email": "avery@example.com",
    "password": "Directory2026",
    "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX"
  }'

curl -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "avery@example.com",
    "password": "Directory2026",
    "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX"
  }'

curl -b cookies.txt http://localhost:4000/api/auth/me

curl -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/logout
```

The dummy token works only with Cloudflare's test secret. Production API clients must obtain a real token from the Turnstile widget on an allowed hostname.

Registration requires a name of 2–100 characters, a valid email, and a password of at least eight characters containing a letter and a number. Standard registration creates an administrator only when it is the first account in a fresh database; otherwise it creates an employee account with access only to their own profile. Browser requests send the session cookie automatically. API clients must retain and resend the returned cookie for every protected request and include a valid `cf-turnstile-response` token on protected mutation requests.

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
      "photo_url": null,
      "created_at": "2026-11-24T10:00:00.000Z",
      "updated_at": "2026-11-24T10:00:00.000Z"
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
- `action`: `account.registered`, `auth.login`, `auth.logout`, `employee.created`, `employee.updated`, `employee.deleted`, `settings.updated`, `onboarding.form_link_saved`, `email.sent`, or `data.exported`
- `entityType`: `account` or `employee`
- `search`: matches the activity summary or the actor's name/email

Results are returned newest first with the same `data` and `pagination` structure as the employee list. Use an administrator's `cookies.txt` file when testing this endpoint.

### Activity log behavior

Registration, login, logout, employee creation, updates (including photo changes), deletion, display-settings changes, Google Form link saves, test emails, and exports are recorded in MySQL. This includes employees imported from Google Forms. Employee update entries include the changed field names and before/after values. On a live MySQL connection, the data change and its audit entry are committed in the same transaction, so an audit failure rolls back the change. Audit records are retained permanently unless an administrator removes them directly from the database.

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
    "joining_date": "2026-11-01",
    "cf-turnstile-response": "<token returned by the Turnstile widget>"
  }'
```

### HTTP status codes and errors

- `200 OK`: successful read or update
- `201 Created`: employee created
- `204 No Content`: employee deleted
- `400 Bad Request`: invalid body, query parameter, ID, or field value
- `401 Unauthorized`: missing, invalid, or expired session, or an invalid onboarding webhook token
- `403 Forbidden`: the signed-in account does not have administrator access
- `404 Not Found`: employee or endpoint does not exist
- `409 Conflict`: email already belongs to another account or employee
- `429 Too Many Requests`: authentication, mutation, upload, submission, or export limit reached
- `413 Payload Too Large`: JSON body exceeds 100 KB or an uploaded image exceeds 2 MB
- `500 Internal Server Error`: unexpected server failure
- `502 Bad Gateway`: Cloudflare Turnstile verification is unavailable or its server secret is misconfigured
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

## Vercel deployment

The repository includes [`vercel.json`](vercel.json) and a serverless Express adapter at [`api/index.js`](api/index.js). Vercel serves the React build as static files, sends `/api/*` to the adapter, and serves the SPA for `/onboarding` and `/onboarding/*`.

1. **Prepare hosted MySQL.** Use a MySQL 8 database reachable from Vercel, preferably with SSL. Run the migrations from a trusted machine with the hosted database variables set:

   ```bash
   npm run db:migrate
   ```

   Do not point this command at a database unless you intend to change its schema. Vercel does not run migrations automatically.

2. **Sign in to Vercel.** From the project root, run:

   ```bash
   npx vercel@latest
   ```

   Link or create a project and accept the detected Vite settings. Alternatively, import the repository through the Vercel dashboard. Keep the project root as the repository root.

3. **Add environment variables** in Vercel Project Settings before the production deployment:

   ```env
   NODE_ENV=production
   APP_TIMEZONE=UTC
   DB_HOST=your_hosted_mysql_host
   DB_PORT=3306
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   DB_NAME=employee_directory
   DB_SSL=true
   CLIENT_ORIGIN=https://your-project.vercel.app
   PUBLIC_APP_URL=https://your-project.vercel.app
   TURNSTILE_SECRET_KEY=your_production_turnstile_secret
   TURNSTILE_ALLOWED_HOSTNAMES=your-project.vercel.app
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   CLOUDINARY_UPLOAD_PRESET=cloudinary_setup
   VITE_API_BASE_URL=/api
   VITE_PUBLIC_APP_URL=https://your-project.vercel.app
   VITE_TURNSTILE_SITE_KEY=your_production_turnstile_site_key
   ```

   Set `APP_TIMEZONE` to the organization's IANA time zone. If the MySQL provider does not require SSL, set `DB_SSL=false`; otherwise keep certificate verification enabled and configure `DB_SSL_CA` when the provider supplies a CA. SMTP variables are optional. Never put Cloudinary API secrets or the Turnstile secret in `VITE_*` variables.

4. **Allow the Vercel hostname in Cloudflare Turnstile.** Add the exact Vercel hostname to the Turnstile widget used by the configured site key. Localhost and the Vercel hostname can both be allowed.

5. **Deploy and align the final URLs.** Run `npx vercel --prod`. If Vercel assigns a different final domain, update `CLIENT_ORIGIN`, `PUBLIC_APP_URL`, `TURNSTILE_ALLOWED_HOSTNAMES`, `VITE_PUBLIC_APP_URL`, and the Cloudflare hostname, then redeploy because Vite values are baked into the build.

6. **Verify the live deployment.** Check `/api/health`, open `/onboarding`, submit a test application with all three documents, verify the documents as an administrator, approve the account, and confirm employee sign-in, attendance, and leave requests. Use test records only and remove them afterward.

The public employee onboarding link is `https://your-project.vercel.app/onboarding`. It opens the direct PeopleHub form, not Google Forms. Production onboarding documents and employee photos are stored privately in Cloudinary; MySQL stores their metadata. Session cookies require HTTPS, which Vercel provides.

## Production build

1. Build the frontend:

   ```bash
   npm run build
   ```

2. Ensure `backend/.env` contains the production database credentials and a real `TURNSTILE_SECRET_KEY`. Add the matching `VITE_TURNSTILE_SITE_KEY` to the frontend environment before building. Set `CLIENT_ORIGIN` to the public frontend origin, `PUBLIC_APP_URL` to the canonical browser URL, and `TURNSTILE_ALLOWED_HOSTNAMES` to the deployed hostnames. Set `APP_TIMEZONE` to a valid IANA zone and `NODE_ENV=production`. Add SMTP variables only if test email is required.

3. Serve the application over HTTPS in production. The `Secure` cookie flag is enabled when `NODE_ENV=production`, so session cookies are only sent over secure connections.

4. Start the production server:

   ```bash
   npm start
   ```

Express serves the built React files and the API from the same origin at `http://localhost:4000`. If the frontend is hosted separately, set `VITE_API_BASE_URL` to the full API base URL and `VITE_PUBLIC_APP_URL` to the canonical frontend URL before running `npm run build`. These Vite values are baked into the build, so rebuild after changing them.

The SQL sort column and sort direction are allowlisted, and all employee values are passed to MySQL as query parameters.

## Tests

```bash
npm test
```

The test suite uses Node's built-in test runner. It validates account and employee input and exercises authentication, administrator authorization, audit logging, CRUD routes, Google Forms imports, direct onboarding and Cloudinary document workflows, attendance and leave APIs, Turnstile Siteverify requests, hostname checks and outage handling, display settings, system logs, backups, URL normalization, and local/Cloudinary employee photo processing against mock services/databases. Coverage includes password hashing, session cookies, employee denial, pagination, audit filters, duplicate emails, webhook-token validation, missing/expired Turnstile tokens, required form fields, repeated submissions, missing administrators, secret-free exports, invalid images, and safe photo paths. A live MySQL server is not required to run these tests.

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

Run `npm run db:setup` to create or upgrade the `users`, `sessions`, `audit_logs`, `system_logs`, `app_settings`, and `onboarding_submissions` tables and any missing employee photo/timestamp columns, then restart the backend. Existing employee records are not changed.

### Employee changes or Activity log return `403 Forbidden`

Sign in with an administrator account. Later registrations are employee accounts and cannot access employee records or the dashboard. On an upgraded installation, `npm run db:setup` promotes the oldest account if no administrator exists.

### Employee onboarding integration is unavailable

Run `npm run db:setup`, restart the backend, and reopen the **Employee onboarding** dialog. The `app_settings` and `onboarding_submissions` tables must exist before the integration configuration can load.

### Google Form responses are not being imported

- Confirm the webhook URL in the copied script is publicly reachable over HTTPS. Google Apps Script cannot reach a `localhost` or private LAN address.
- If an ngrok address changed, open PeopleHub using the new public URL, copy the new script, and run `setupPeopleHubOnboarding` again.
- Open the Google Apps Script project and check **Executions** for authorization or import errors.
- Confirm the form has all seven required questions with the exact titles listed above.
- Confirm the response has a unique email and valid values for every field.
- Confirm the script was copied from a currently signed-in administrator's dialog. The private webhook token must match the token stored by the backend.

### Created time differs from the local clock

The database stores UTC, so a difference of 5 hours 30 minutes usually means the display timezone is still `UTC`.

1. Open **Settings → Time and date → Time zone**.
2. Select or enter `Asia/Kolkata` for India.
3. Select **Save display settings**, solve the security check, and reload the employee list.
4. Confirm the preview and Created date now match the local clock. Do not edit employee records to correct display time; the stored timestamp is already correct.

### Turnstile fails or keeps refreshing

1. Confirm `VITE_TURNSTILE_SITE_KEY` in the built frontend matches the Cloudflare widget's site key and the backend's `TURNSTILE_SECRET_KEY`.
2. Add the browser hostname to the Cloudflare widget configuration and to `TURNSTILE_ALLOWED_HOSTNAMES` (or verify it is derived from `CLIENT_ORIGIN` / `PUBLIC_APP_URL`).
3. Confirm `https://challenges.cloudflare.com/turnstile/v0/api.js` is reachable from the browser.
4. Tokens expire after five minutes and are single-use. Select **New check** after an expiry or widget error, then submit again.
5. HTTP 400 means the token is missing, invalid, expired, reused, or from the wrong hostname. HTTP 502 means the verification service could not be reached or the server secret is misconfigured. HTTP 429 is the request rate limiter, not Turnstile.
4. If every form returns `429`, wait for the 15-minute rate-limit window or restart the API only during local development.

### Employee photo upload is rejected

Use a real JPEG, PNG, or WebP file no larger than 2 MB, with both dimensions between 128 and 4096 px. Renaming another file type to `.jpg` does not make it a valid image. Check **Settings → Security and URLs → Image policy** for the server's active limits.

### Employee photo does not display

1. Confirm the employee still has a photo and the API is running.
2. Keep `VITE_API_BASE_URL=/api` when using the Vite proxy; do not add a second `/api` to the path.
3. Sign in as an administrator. Photo reads are private and return `403` for employee accounts.
4. If the file was removed manually, upload the photo again. Server-side replace/delete operations clean up old files automatically.

### Test email is disabled or fails

1. Set the SMTP variables in `backend/.env` and restart the API.
2. Check **Settings → Email configuration** for the configured status.
3. Verify the SMTP host, port, TLS mode, username, password, sender, and recipient with your mail provider.
4. Check **System logs** for the safe operational error and retry with a new Turnstile.

### Backup download fails

1. Sign in as an administrator and retry after the rate-limit window.
2. Use JSON for **Full backup**; CSV is available only for employees, activity, or system logs.
3. Check **System logs** for database errors. Backups are application snapshots, not MySQL dump files, and do not include photo files or secrets.

### Shared onboarding URL uses the wrong address

Set `PUBLIC_APP_URL` to the public HTTPS browser URL and restart the API. When using a tunnel, open PeopleHub through that URL before copying the Apps Script. Update `VITE_PUBLIC_APP_URL` as well when a separately hosted frontend must generate absolute browser links, then rebuild the frontend.

### Port already in use

Change `PORT` in `backend/.env` and set `VITE_API_PROXY_TARGET=http://localhost:<new-port>` in `frontend/.env` for development. Restart both processes after changing environment variables.
