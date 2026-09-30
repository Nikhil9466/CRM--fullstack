# Virtual Binz CRM backend

See [README.md](../README.md) for setup, database upgrades, roles, API endpoints, tests and security notes.

The Express, Prisma and PostgreSQL backend serves the frontend and protected CRM API on port 4000.

### Document centre

Open **Document centre** below **Tasks** to upload and download files up to 10 MB each. Documents are stored in PostgreSQL and included in database backups. The list shows the original filename, size, uploader and upload date, with 25 files per page.

Admins can access their organisation's documents; team leaders can access their current team's documents; employees can access their own. Downloads require a current authenticated session and are served as attachments. Empty files and oversized uploads are rejected.

Apply the included migration with `npm run db:deploy` and regenerate the Prisma client with `npm run prisma:generate` from `crm-backend` before restarting an existing installation. The document integration test uses `CRM_TEST_DATABASE_URL` and runs through `npm run test:integration`. Use a dedicated test database.
