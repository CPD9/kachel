# Kachel

Your AI heats your home.

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white">
  <img alt="Turborepo" src="https://img.shields.io/badge/Turborepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white">
  <img alt="uv" src="https://img.shields.io/badge/uv-DE5FE9?style=for-the-badge&logo=uv&logoColor=white">
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white">
  <img alt="Blender" src="https://img.shields.io/badge/Blender-E87D0D?style=for-the-badge&logo=blender&logoColor=white">
</p>

<p align="center"><img src="docs/media/daynight.gif" alt="Split screen through one January day in Basel: the city outside goes from night to day and back while the servers in the basement plant room keep the house warm"></p>

Small servers in a home's basement run AI jobs, and their heat goes into space heating and hot water.
A job runs only when its heat is useful.

<p align="center"><img src="packages/ui/src/heat-loop.webp" width="360" alt="A basement server runs a job, its heat fills the hot-water tank and warms the house"></p>

More renders, the videos and the charts are in [docs/media](docs/media/README.md).
Every value the model assumes, with its unit and source, is in [docs/assumptions.md](docs/assumptions.md).

## Run it

```sh
make bootstrap
make dev
make check
```

`make dev` starts the local Supabase stack (Docker) and serves the host app on http://localhost:5173 and the console on http://localhost:5174.
Copy each `.env.example` to `.env` and fill in the keys from `pnpm exec supabase status -o env`.
Row level security shows each person only their own rows, so sign in to the host app as the seeded demo host, `host@kachel.test` with the password `kachel-demo` (local stack only).

## Repo map

| Path                 | What it is                                                      |
| -------------------- | --------------------------------------------------------------- |
| `apps/host`          | React app for hosts: their house, their heat, their servers     |
| `apps/console`       | React app for compute buyers: jobs and their state              |
| `packages/ui`        | Shared components and design tokens                             |
| `packages/db`        | Typed Supabase client and the generated database types          |
| `packages/config`    | Shared ESLint and TypeScript settings                           |
| `services/agent`     | Python agent on the server box: pauses and resumes the real job |
| `services/scheduler` | Python scheduler: hourly decisions, yearly balance, live demo   |
| `supabase`           | Local Supabase config, schema migrations and synthetic seed     |
| `scripts`            | Repository checks                                               |

## Team

- Peter Dike ([@CPD9](https://github.com/CPD9))
- Duc ([@bila9630](https://github.com/bila9630))
- Loyola ([@Loyola-sk](https://github.com/Loyola-sk))
- Nikolas ([@Ni93c42l](https://github.com/Ni93c42l))

## Licence

MIT. Copyright (c) 2026 the Kachel team.
