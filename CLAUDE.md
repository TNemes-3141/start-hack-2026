# CLAUDE.md — start-hack-2026

## Project Overview

Hackathon project for START Hack 2026. AI-powered, data-driven web app with rich UI and data visualization. **Hackathon priorities: ship fast, look great, work correctly.**

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (radix-nova style, neutral base) |
| Icons | Lucide React |
| Charts | Recharts |
| Database | PostgreSQL via Supabase (REST API over HTTPS) |
| AI | OpenAI API (`openai` SDK) |

## Project Structure

```
app/           # Next.js App Router pages and layouts
  layout.tsx   # Root layout (Geist font, metadata)
  page.tsx     # Home page
  globals.css  # Global styles + Tailwind v4 + theme tokens
components/    # Shared components
  ui/          # shadcn/ui primitives (auto-generated)
lib/
  utils.ts     # cn() utility (clsx + tailwind-merge)
hooks/         # Custom React hooks
public/        # Static assets
```

## Key Conventions

### Path Aliases
- `@/*` maps to the project root. Use this for all imports.

### Styling
- Use Tailwind utility classes for all styling. No inline styles, no CSS modules.
- Use the `cn()` helper from `@/lib/utils` for conditional/merged class names.
- Theme tokens are OkLCH CSS variables defined in `globals.css`. Prefer semantic tokens (`bg-background`, `text-foreground`, etc.) over hardcoded colors.
- Dark mode is supported via the `.dark` class.
- The radius scale goes: `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl` — use `rounded-*` utilities.

### Components
- Use shadcn/ui components from `@/components/ui` for all UI primitives (buttons, inputs, cards, dialogs, etc.).
- Add new shadcn components with: `npx shadcn@latest add <component>`
- Build page-level and feature components in `@/components/`, not inside `app/`.
- Keep components small and focused. Compose from primitives.

### Data Fetching
- Prefer Next.js Server Components for data fetching where possible (no `"use client"` needed).
- Use `"use client"` only when you need interactivity (event handlers, state, hooks).
- Database access goes through server-side code only (Server Components, Route Handlers, Server Actions).

### API Routes / Server Actions
- Place API routes under `app/api/`.
- Use Server Actions for form submissions and mutations.
- Keep OpenAI and database calls server-side only — never expose API keys to the client.

### Charts
- Use Recharts for all data visualization.
- The theme exposes 5 chart color tokens: `--chart-1` through `--chart-5`. Use these for consistent palette.

### Database Access

- **Never use the `postgres` driver** for direct TCP connections — `db.[id].supabase.co` is unreachable from this environment (IPv6 / DNS failure).
- **Always use the Supabase REST API** via `fetch` to `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/<table>`.
- Authenticate with both headers: `apikey: <key>` and `Authorization: Bearer <key>`, using `NEXT_SUPABASE_SECRET_KEY` for server-side routes.
- Filter params use PostgREST syntax: `?column=eq.value&limit=1`.

Example:
```ts
const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/my_table?col=eq.${val}&limit=1`, {
  headers: {
    apikey: process.env.NEXT_SUPABASE_SECRET_KEY!,
    Authorization: `Bearer ${process.env.NEXT_SUPABASE_SECRET_KEY!}`,
  },
});
const rows = await res.json();
```

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
NEXT_SUPABASE_SECRET_KEY=
SUPABASE_CONNECTION_STRING=   # not used — direct TCP fails; kept for reference only
OPENAI_API_KEY=
```

## Development

```bash
npm run dev    # Start dev server (localhost:3000)
npm run build  # Production build
npm run lint   # ESLint check
```

## Hackathon Mindset

- **Functionality first.** If it works and looks good, ship it.
- **Beautiful UI matters.** Use shadcn components, Tailwind animations (`tw-animate-css`), and Recharts for dashboards. Polish the visuals.
- **Move fast.** Skip over-engineering — no unnecessary abstractions, no premature optimization.
- **Keep it simple.** Three working lines beat a clever abstraction every time.
- Don't add error handling beyond what users will encounter. Skip edge cases that won't happen in demo scenarios.