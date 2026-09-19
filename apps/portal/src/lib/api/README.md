# API layer

- **client.ts** – Base API client (fetch wrapper, headers, error handling).
- Add endpoint modules: `endpoints/auth.ts`, `endpoints/user.ts`, etc.
- Or group by feature: `lib/api/auth.ts`, `lib/api/users.ts`.

Use with React Query / SWR in components or in custom hooks under `hooks/`.
