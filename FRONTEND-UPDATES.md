# Animated frontend

Based on the corrected `CRM--fullstack-new.zip` archive.

The React frontend now includes Nova, a friendly robot companion with an ivory
and lavender shell, a glossy face, and mint details on the login, signup, and
password pages. His eyes follow the pointer, he blinks and waves,
and his expression changes as the form changes:

- Empty or partially filled form: a friendly smile.
- All required details valid: a wide laugh, bouncing body, and waving arm.
- A required field left blank, cleared, or invalid: a smile with normal form feedback.
- Submitting: a waiting expression.
- Server error: an encouraging message and a reassuring smile.
- Success: a happy expression before the workspace opens.

The character receives only an expression state. Passwords and other form
values are never passed to it. Existing cookie sessions, CSRF protection, API
requests, password visibility controls, and role permissions are preserved.

The new cursor halo follows the normal cursor and expands over links and
buttons. Touch devices keep normal touch behavior. Reduced-motion preferences
disable decorative motion and pointer following while keeping form feedback.

The dashboard has refined mint, ivory, and lavender styling, smoother hover
feedback, panel and chart entrances, and dialog transitions. Both the login
pages and workspace support light and dark themes. Document centre remains
below Tasks; employee creation and assignment retain their existing meanings.

Tapping the theme button now reveals the new theme in a smooth one-second circle that expands
from the tap, with a small spin on the button. Keyboard activation starts the
reveal at the button centre. Rapid taps settle on the latest selection without replaying a backlog. Browsers without
the circular-reveal API use a short colour fade, while reduced-motion users
get an immediate theme change.

## Preview the frontend

From this project folder, run:

```sh
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/login.html`. This static preview lets you explore
the login design; signing in needs the backend and PostgreSQL database.

## Run the complete CRM

Follow the existing [README.md](README.md) for database setup. Install both
sets of dependencies, configure `crm-backend/.env` using `.env.example`, and
apply migrations to your intended database. Then run `npm run dev` from this
folder. The development app opens at `http://localhost:5173/login.html`.

## Verification

The production build passed. The existing backend unit and integration suites
passed against an isolated temporary PostgreSQL database. The existing browser
suite passed real signup/login, record editing, team and role behavior,
document upload/download, attendance, password changes, and mobile navigation.
Additional browser checks cover the mascot, cursor, validation feedback,
themes, and reduced motion. No existing database was used for these checks.
