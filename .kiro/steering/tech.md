# Tech Stack

## Frontend

- **React 18** with TypeScript
- **Vite** (build tool, dev server on port 8080)
- **Tailwind CSS** with CSS variables for theming
- **shadcn/ui** (Radix UI primitives)
- **React Router DOM** for routing
- **React Query** (@tanstack/react-query) for server state
- **React Hook Form** + **Zod** for form handling and validation
- **Recharts** for data visualization
- **Lucide React** for icons
- **date-fns** for date manipulation

## Backend

- **Supabase** (PostgreSQL, Auth, Edge Functions, Storage)
- Edge Functions in TypeScript/Deno

## Key Libraries

- `class-variance-authority` + `clsx` + `tailwind-merge` for styling utilities
- `sonner` for toast notifications
- `vaul` for drawer components
- `embla-carousel-react` for carousels

## Common Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npm run preview      # Preview production build
```

## Environment Variables

All env vars must be prefixed with `VITE_`. Required variables:

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `VITE_APP_NAME` - Application name
- `VITE_APP_URL` - Application URL
- `VITE_APP_ENVIRONMENT` - development | staging | production

See `.env.example` for full list.

## Path Aliases

`@/*` maps to `./src/*` (configured in tsconfig.json and vite.config.ts)
