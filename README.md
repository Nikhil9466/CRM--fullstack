# Virtual Binz CRM

A team CRM for managing contacts, deals, tasks and sales pipelines. Built with
Express, Prisma and PostgreSQL, with a browser frontend served by the backend.

## Included

- Responsive dashboard: real contact count, active deals, won value this month,
  pending tasks, six-month wins chart, pipeline totals and today's tasks.
- Working Contacts, Deals and Tasks views: create/edit, admin-only permanent
  deletion, pagination and filtering. Admin contact assignment.
- Contact-linked deals, INR amounts, expected close dates and stage dropdowns.
- Admin-editable pipeline names/order and custom Open/Won/Lost-type stages.
- Task completion, due dates, optional contact OR deal link.
- Global search, light/dark mode, shared organisation data and server-enforced roles.
- Team-member creation, role changes and account deactivation.
- Database migration, tests, environment template and admin-promotion command.

Excluded: CSV import/export, tags, kanban dragging, notifications, notes and exportable reports.

The backend serves **front end/home.html** and its supporting files.
Back up your PostgreSQL database before applying migrations, and test upgrades
against a copy first. Keep `.env` private.

## Run locally

Requires Node.js 20+ and a running PostgreSQL database.
From the repository root:

    cd crm-backend
    npm ci
    cp .env.example .env

Edit .env: set DATABASE_URL to your PostgreSQL connection string.
JWT_SECRET and JWT_EXPIRES_IN are no longer used.

Then:

    npm run prisma:generate
    npm run db:deploy
    npm start

Open **http://localhost:4000**. Do not open home.html by double-clicking or
through Live Server: frontend and API are intentionally served together.

### Existing database / account

All migrations are supplied. They add tables and account fields without deleting existing users. db:deploy applies only migrations not already recorded.

If you originally used prisma db push, Prisma may require a baseline. Do not
reset your database. After verifying that the existing users table matches the
original migration, mark ONLY that original migration as applied:

    npx prisma migrate resolve --applied 20260921085113_add_password_reset
    npm run db:deploy

Existing non-admin accounts use the Employee role. Promote your own trusted account:

    npm run admin:promote -- your-exact-existing-email@example.com

This is a local server-operator command, not a public endpoint. It matches the
stored email exactly. Log in again afterward.

Review historical members: the old signup allowed arbitrary organisation IDs,
so historical membership was not verified. Deactivate unknown accounts.
The cookie-session upgrade requires everyone to sign in again; old JWTs are no longer accepted.

### Fresh database

Choose **Create a new workspace** on the login page. Its creator becomes admin.
Existing organisation IDs cannot be joined through public signup.
Admins add members under **Team & settings**, then privately share their initial
password. Members can change it at /account.html.

Public signup allows creation of new, isolated organisations. Disable it at your
deployment gateway if you require an invitation-only installation.

## Permissions

| Action | Employee | Sub-admin | Admin |
| --- | --- | --- | --- |
| View/edit CRM records, search and dashboard | Assigned work | Own team | Organisation |
| Assign contacts/tasks | Self | Own team | Organisation |
| Delete CRM records | No | Own team | Organisation |
| Remove employees from a team | No | Own team | Any team |
| Add/transfer employees to a team | No | Request approval | Directly / approve requests |
| Create accounts, appoint leaders, change roles | No | No | Yes |
| Configure shared pipeline stages | No | No | Yes |
| Access another organisation's data | No | No | No |

Assignments determine record visibility. Roles and team membership are read from the database on each request.
Admins cannot demote/deactivate themselves. Deactivation invalidates existing
sessions, even after reactivation.

Contacts, deals and tasks move to a recoverable recycle bin after confirmation. Active linked records must be unlinked or recycled first; there are no cascading deletions. Pipeline stages are permanently deleted only when no deals, including recycled deals, reference them.

## Reporting definitions

- Total contacts: contacts visible to the signed-in account (organisation, team, or own assignments).
- Active deals / open pipeline value: deals in Open-type stages.
- Won this month: currently Won-type deals with actual closedAt in the current
  UTC calendar month. Expected close dates do not determine revenue.
- Wins chart: currently Won-type deals for each of the last six UTC months.
- Pending tasks: all incomplete team tasks.
- Today's tasks: incomplete tasks on the browser's local date, first 8;
  full list under Tasks.

Moving a deal to a terminal stage records its close time. Reopening removes it
from won reports. Reports reflect current records, not immutable accounting or
historical audit records. Moving a deal to the recycle bin removes its contribution; restoring it returns the contribution.
Zero means no matching records, not a placeholder. Errors are separate from zero.
Refresh retrieves shared changes; there are no push alerts.
Company filtering means the contact's company, not cross-tenant organisation access.

## Authentication changes

- Normal email domains accepted rather than Gmail only.
- New passwords: 12+ characters, at most 72 UTF-8 bytes for bcrypt.
- Existing password hashes and login credentials remain compatible.
- Personal password changes require the current password and revoke prior sessions. Admins can reset another member’s password from Team & settings; this revokes that member’s sessions without changing role or activation.
- Unsafe email + organisation-ID password reset is disabled. Secure email
  recovery remains future work. Members should ask a signed-in admin to reset their password; if no admin can sign in, contact the server operator.
- Profile photos are not supported. Existing photo columns/files are retained;
  initials are shown instead. Uploads are not served.
- Authentication uses random server-side sessions stored in PostgreSQL (only a hash of the cookie secret is stored). The browser receives an HttpOnly, SameSite=Lax cookie, with Secure enabled for HTTPS/production. No authentication credentials are stored in localStorage or sessionStorage.
- All tabs in one browser profile share a login. Account changes refresh other tabs; stale CSRF tokens block old pages from writing under a changed account. Use separate browser profiles/private windows for different accounts.
- Remember me persists the cookie for seven days. Otherwise it is a browser-session cookie (browser session restore can retain it). All server sessions expire after seven days. Logout revokes the session on the server.
- Authenticated writes require a session CSRF token. Unsafe requests also require X-CRM-Request: 1, JSON bodies and an allowed origin. Login/signup are protected by origin checks and the custom header; cross-origin CORS is disabled.

## Tests

    npm test

For API integration, migrate a separate disposable PostgreSQL test database first.
Never use production:

    CRM_TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/crm_test" npm run test:integration

Tests create isolated organisations and clean up their own records. Without
CRM_TEST_DATABASE_URL, integration tests skip rather than using your .env.

## Before production

Use HTTPS, backups, private database credentials, dependency updates and
deployment-specific rate limiting. Login rate limits are in-process, not shared
across multiple server instances. Configure proxy trust for your actual topology.

Set NODE_ENV=production and APP_ORIGIN to the exact public HTTPS origin (no trailing slash), e.g. https://crm.example.com. Production startup requires HTTPS configuration; cookies use the __Host- prefix, Secure, HttpOnly and no Domain attribute. Serve frontend and API on that same origin. A strict Content Security Policy is still recommended. Complete a deployment/security review before using
real customer information. Google Fonts is optional; system fonts are the fallback.

## API map

- POST /api/auth/signup, /api/auth/login, /api/auth/logout; GET /api/auth/session
- GET /api/me; POST /api/password; PATCH /api/member-passwords/:id (admin only)
- GET /api/dashboard?today=YYYY-MM-DD
- GET /api/search?q=...
- GET/POST /api/contacts, /api/deals, /api/tasks
- GET/PATCH/DELETE /api/{resource}/:id
- GET/POST /api/stages; PATCH/DELETE /api/stages/:id
- GET/POST /api/members; PATCH /api/members/:id

CRM endpoints require the session cookie. Fetch GET /api/auth/session for the CSRF token; send it in X-CSRF-Token on authenticated writes, with X-CRM-Request: 1. Login/signup return user and csrfToken, never an authentication token.
Collections return {items,total,page,pageSize}, 50 rows per page; stages and members
return arrays. Money is represented as decimal strings. Contact edits submit the
full contact form; deal/task edits allow partial fields. Record text is escaped
before rendering HTML.


## Team roles and profile (September 2026)

Open your profile using the avatar beside the sun/moon theme toggle. It shows your name, email, phone, organisation, team, role, account status and join date, with a change-password link.

- **Admin:** organisation-wide CRM access, account and role management, team creation, leader appointment, direct employee assignment, and approval/rejection of team requests.
- **Sub-admin:** access to their team's contacts, deals, tasks and performance; can assign work within the team and delete team records. Can remove employees from their team immediately, but must request admin approval to add or transfer employees. Cannot create accounts, appoint leaders, change account roles, deactivate accounts, or alter shared organisation pipeline settings.
- **Employee:** access to their own assigned contacts/tasks and deals belonging to their contacts. Can create and update their own work. Cannot manage roles, membership or delete CRM records.

From **Team & settings → Teams & performance**, admins create a team and select an active, unassigned employee/sub-admin as leader. This sets the leader's role to Sub-admin. An employee can belong to one team at a time. Replacing a leader returns the previous leader to the Employee role within the same team. Admins can reassign any employee directly; sub-admin additions appear in the approval queue. Removing an employee keeps their account and work, and immediately removes the former leader's access to that employee's work. Unassigned sub-admins can manage their own work until appointed to a team.

Performance uses actual, all-time assigned records and **current** team membership: contact count, total/won deals, won deal value, and completed/total tasks. Deal performance follows the contact owner; task performance follows the task assignee. Reports include inactive and unassigned employees. Records without an assignee stay admin-only and do not count toward an employee's performance. Linked tasks require access to their linked record as well as assignment; when moving contact ownership across teams, admins should review linked task assignments too. Team leaders can browse a limited employee directory (name/email) to request additions, without access to other teams' CRM work.

Migration `20260923000000_teams_and_roles` renames existing USER accounts to EMPLOYEE without deleting data, adds teams/approval requests, and assigns existing linked tasks to their contact owner. Standalone legacy tasks remain admin-only until assigned. Run `npm run db:deploy` and `npm run prisma:generate` from `crm-backend` when deploying to another environment, then restart the server. The local desktop database has already been migrated.

Run `npm test` for unit validation. With `CRM_TEST_DATABASE_URL` set to a **dedicated disposable PostgreSQL database** migrated to the latest schema, run `npm run test:integration` for auth, isolation, CRM CRUD, team permissions, approval/rejection, concurrent approval, membership removal, profile data and performance tests. Integration tests never use the normal `.env` database by default.


### Login regression checks

Changing Employee → Admin keeps the same email and password. The account must be active. Refreshing/navigation reloads the current role and team from the server, so existing sessions receive the new permissions. A profile includes a Switch account button, and password inputs include Show/Hide controls.

Failed login attempts are limited per email/IP (10 per 15 minutes), with an IP safety net (100 failures per 15 minutes) and bounded in-flight checks. Successful sign-ins do not use the failure quota. A blocked response includes Retry-After. Limits remain in-process for this local, single-server deployment.

The test commands cover cookie sessions, CSRF rejection, server-side logout, expiry, remember-me, stale-tab handling, login throttling/concurrent guesses, promotion and fresh login, demotion, repeated/concurrent login, password reset authorization, password-change session revocation, and disabled-account recovery. Browser verification also exercises switching accounts in two tabs and the contact/task forms using a separate disposable database.


## Activity history and recycle bin

Under **Team & settings**, admins can open **Activity history** and admins/sub-admins can open **Recycle bin**. Employees cannot access either page. Sub-admin recycle access follows current team membership and record assignments; admins can restore any record in their organisation.

History begins when migration `20260925000000_history_and_recycle_bin` is deployed. Successful CRM changes, account/role changes, password changes (never values), team assignments/removals, and approval decisions are recorded with actor, timestamp, record and selected before/after details. Login, public workspace signup and server-operator/direct database changes are outside this history. History cannot be edited/deleted through the API. This is application history, not a tamper-proof external audit service. No passwords, hashes, session secrets or raw request bodies are logged. Mutations and history entries commit in the same transaction; failed operations leave neither a change nor a success event.

Deleted contacts, deals and tasks remain in PostgreSQL until restored, with no automatic expiry or permanent-purge interface. Normal lists, search, detail pages, dashboard and performance exclude them. Restore contacts before their deals and restore linked contacts/deals before tasks. Restoring keeps original values and assignments. If a task's historic assignee no longer has linked-record access, an admin may restore it and correct the assignment in Tasks; employees still cannot see linked work outside their scope. Restoring an inactive employee's work does not activate their account. Pipeline stages and removed team memberships are not recycle-bin records.

Both pages support search, type filtering and pagination; history also has inclusive UTC date filters. Displayed timestamps use the browser's local timezone. Old deletions cannot be recovered by this feature.

API additions:

- `GET /api/activity` (admin): optional `type`, `q`, `from`, `to`, `page`.
- `GET /api/recycle-bin?type=contacts|deals|tasks`: optional `q`, `page`.
- `POST /api/recycle-bin/:type/:id/restore` (admin/sub-admin): standard cookie and CSRF protections apply.

Back up the database, generate the Prisma client, run `npm run db:deploy`, and restart the backend. The integration command includes recovery, audit redaction, dependency ordering, tenant/team permissions, concurrent restoration and rollback checks on a disposable database.

## Attendance

Attendance uses the existing CRM users, cookie sessions, CSRF protection, organisation write transactions, activity history and team scope. It has no delete endpoint and does not use the recycle bin.

### Setup and daily use

After backing up the database, run these commands in `crm-backend` when installing this version on another local database:

    npm run prisma:generate
    npm run db:deploy
    npm start

Migration `20260926000000_attendance` is additive: it creates `AttendanceSettings`, `AttendanceRecord`, `AttendanceBreak` and `AttendanceCorrectionRequest`, plus composite tenant/user references, indexes, timestamp order checks and partial unique indexes. It does not reset existing data. `AttendanceDecision` stores only correction workflow decisions. The migration was applied locally during implementation, after a backup in `work/pre-attendance-20260924.dump`.

1. Admin opens **Team & settings → Attendance Settings**, selects the workspace timezone (IANA name, e.g. `Asia/Kolkata`), working days, start/end times, grace minutes and expected hours. Until saved, the explicit default is UTC, Monday–Friday, 09:30–18:00, 15-minute grace and 8 expected hours.
2. Every signed-in role can use **Attendance → My attendance → Check In → Start Break → End Break → Check Out**. Multiple breaks are supported (up to 20 per day). Server time is authoritative. UI timers are approximate between 30-second server refreshes.
3. Employees see only their own history and correction requests. Sub-admins get **My team**, using the existing `memberScope` helper (unassigned sub-admins see themselves). Admins get the organisation dashboard, policy configuration and correction review, confined to their organisation. Dashboard team/employee/status/date filters and pagination do not expand scope.
4. A correction proposes a complete check-in, checkout and all breaks, with a reason. It may cover a missing workday. The request changes nothing until an admin approves it. Only admins review, consistent with team-addition approvals. Admins may approve or reject their own requests as well as requests from their organisation; the reviewer remains recorded in Activity History. Rejection leaves the official record untouched. A request based on a changed record must be rejected and resubmitted. New requests also snapshot the server-selected policy, so changing the workspace policy while a missing-day correction is pending cannot alter the approved day. Legacy requests without that snapshot retain the original current-policy fallback. Duplicate pending requests, overlapping workdays, future/invalid times and overlapping breaks are rejected.

### Calculations and reporting decisions

- Events use UTC timestamps; `workDate` is the calendar date of check-in in the workspace policy timezone. Screens show event times in the browser timezone and state that timezone on correction forms. Correction forms preserve exact original UTC timestamps (including seconds and milliseconds) for unchanged fields; deliberately editing a field uses the newly entered local time.
- **Worked = checkout (or server now) − check-in − all breaks**. An open break runs through server now. Expected hours are informational, with a shortfall on completed personal cards; short days are not automatically labelled absent.
- **Late** means arrival after work start plus grace. Arrival exactly at the threshold is Present. Present/Late describe arrival; Working/On Break/Checked Out describe lifecycle. Summary counts therefore overlap intentionally.
- **Absent** is derived for an active account with no record on a working date after scheduled end, or on a past working date. Before today's end, it is Not checked in. Dates before account creation are excluded. Off days are labelled **Holiday**; they are weekly non-working days, not a public-holiday calendar. Regular check-in on an off day is blocked; authorised off-day work can be recorded through an approved correction.
- Historical records stay with the same user. Team reports use **current** team membership, consistent with Teams & performance. Former leaders lose access after reassignment. Inactive accounts are included only when a record exists for the selected day; deactivated sessions cannot act.
- Each recorded day snapshots its policy; policy edits cannot retroactively change that record's late classification or expected hours. Unrecorded dates use the **current** policy. There is no historical employment schedule/calendar yet; absence reports should be interpreted accordingly.
- Overnight schedules are not configured in this version. An existing shift can be closed after midnight within 24 hours of check-in. Older open shifts require a correction; the card offers a direct correction action instead of controls that the server would reject, even when the open day is outside the selected history range. No automatic checkout is invented. Until closed, an old shift blocks a new check-in.
- All writes share the existing organisation row lock and post-lock session/role checks. Database uniqueness additionally enforces one record per employee/day, one open workday, one open break and one pending correction per employee/date. Corrections and their audit entries commit atomically. Activity history includes policy changes, requests, review decisions with before/after timestamps, and workday transitions; no credentials are logged.

### API

All routes below are under `/api` and use existing authenticated session/CSRF middleware:

| Method | Route | Access / purpose |
| --- | --- | --- |
| GET | `/attendance/settings` | Signed-in users read their workspace policy |
| PUT | `/attendance/settings` | Admin configures policy |
| GET | `/attendance/today` | Own current day plus any open workday |
| POST | `/attendance/check-in` | Own check-in, empty JSON body |
| POST | `/attendance/start-break` | Own break start, empty JSON body |
| POST | `/attendance/end-break` | Own break end, empty JSON body |
| POST | `/attendance/check-out` | Own checkout, empty JSON body |
| POST | `/attendance/records/:id/resume` | Admin only; `{version, reason}` reopens their own or an active employee’s completed current workday |
| GET | `/attendance/history?from=YYYY-MM-DD&to=YYYY-MM-DD` | Own history; maximum 93 days |
| GET | `/attendance/report?date=YYYY-MM-DD&teamId=…&employeeId=…&status=…&page=1` | Admin organisation / sub-admin team dashboard |
| GET | `/attendance/corrections?view=mine&status=PENDING&page=1` | Own requests; `view=review` is admin-only |
| POST | `/attendance/corrections` | Own `{workDate, reason, proposed: {checkIn, checkOut, breaks: [{start,end}]}}`; timestamps must be UTC ISO strings |
| PATCH | `/attendance/corrections/:id` | Admin `{status: "APPROVED" or "REJECTED", reviewNote?}` |

### Validation and future scope

`npm test` includes attendance calculation, timezone, late threshold, absence, policy and correction validation tests. `npm run test:integration` includes attendance and all existing CRM integration suites. Integration tests require an explicit, separately migrated `CRM_TEST_DATABASE_URL`; they never fall back to `.env`. Attendance tests exercise real sessions, CSRF, organisation/team isolation, team reassignment, concurrent actions, corrections, stale requests, deactivation and audit entries, and clean up their own fixtures.

Browser verification used a disposable database and real HTTP API: employee check-in/break/checkout, correction submission, admin approval/recalculation, policy settings, history, organisation and leader views, and responsive layouts. No test employees or attendance were added to the normal CRM database.

Future improvements: dated public holidays and leave, effective-dated policy/employment calendars, reminders for open shifts, shift schedules, exports and payroll integrations. Current reports calculate summaries in memory for the permitted directory; large organisations would benefit from database-side aggregation. The existing per-organisation write lock deliberately prioritises correctness over high-volume clock-in throughput.

Admins can use **Resume work** on My attendance or Organisation attendance after an accidental checkout. It preserves the original check-in and arrival classification, records the checkout-to-resume gap as a closed break, and logs the reason and previous checkout in Activity History. Only the current workday, less than 24 hours after check-in and with fewer than 20 breaks, can resume; older days require a correction. Concurrent/stale requests and overlapping shifts are rejected. Pending corrections against the old record version must be rejected and resubmitted. This change needs no additional database migration.
