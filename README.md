# Process Perfected

Build a multi-tenant SaaS web app for checklists, aimed at customer service teams and companies that want clear, repeatable process checklists. Swedish UI (with i18n so more languages can be added). Use Supabase for auth, database and row-level security.



CORE CONCEPTS

- Organization (tenant): every record belongs to one organization; users only see their own organization's data (enforce with RLS).

- Roles per organization: Admin, Manager, Agent.

- Template: a reusable checklist with a title, description, category and ordered items. Items can be: checkbox, required checkbox, text field, number, dropdown, and optional note/photo upload. Items can be grouped in sections.

- Run: an instance of a template that an Agent fills in (e.g. one per customer case). Stores who, when, status (in progress / completed), and every answer. Required items must be done before completing.

- Versioning: editing a template creates a new version; old runs keep the version they started with.



SCREENS

1. Login / sign up / invite team members by email.

2. Dashboard: active runs, completed today, completion rate, overdue runs.

3. Templates: list, create, edit (drag-and-drop item ordering), duplicate, archive.

4. Start a run: pick a template, optionally add a reference (case number / customer name), then fill in with a clean, fast checkbox view that works well on mobile.

5. History: searchable and filterable list of completed runs with full detail view and export to CSV/PDF.

6. Team: manage users and roles.

7. Settings and billing: organization name, logo, current plan.



LICENSING

- Plans: Free (1 user, 3 templates), Team (per seat per month, unlimited templates), Business (adds audit log, SSO-ready, API access).

- Store plan and seat count on the organization; enforce limits in the app (block inviting more users than seats, block creating templates over the limit) and show a clear upgrade prompt.

- Prepare Stripe integration for subscriptions with per-seat pricing, but start with a mock billing page.



QUALITY

- Clean, modern, calm design; light and dark mode.

- Audit log of key actions (template changed, run completed).

- Seed demo data: a "Customer onboarding" and a "Complaint handling" template.



Start with auth, organizations, templates and runs. Add billing and exports afterwards.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/415dcdd0-5ee3-4fb2-835d-21232c564303).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
