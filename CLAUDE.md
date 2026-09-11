# Deployments Dashboard

FastAPI + Mongo under `api/`, Next.js App Router under `web/`. The browser holds the whole dataset in RxDB over IndexedDB and reads it through TanStack DB live queries.

## Commands

```bash
docker compose up -d          # mongo, api on :8000, web on :3000
make api                      # uvicorn on :8000, reloading
make web                      # next dev on :3000
make test                     # pytest on testcontainers Mongo, vitest in jsdom
make lint                     # ruff, ty, oxlint, oxfmt, knip
```

Per side: `make test-api`, `make test-web`, `cd web && pnpm check`.

`make seed COUNT=n` fills an empty collection. `make seed-reset` **drops the collection first**, so never run it against a database you did not create.

## Startup path

`web/src/app/page.tsx` fetches the dataset server-side and passes it down as a seed, so the client hydrates instead of pulling every page itself. Things that bite here:

- The page awaits the seed before rendering, so nothing reaches the browser until it resolves. There is no `loading.tsx`.
- A failing seed is swallowed by a bare `catch` and degrades silently to client-side pulling. Check the document for row data before assuming the server pass ran.
- The `deployments-planted` cookie tells the server the browser already holds rows. It can desync from IndexedDB, and when it does the client pulls everything with no seed to fall back on.
- The server reads `API_ORIGIN ?? NEXT_PUBLIC_API_URL`. Anything that blocks non-browser clients from the API (a firewall rule, bot protection) kills the seed and only the seed.

## Layering

Route files under `web/src/app` import feature internals directly. There is no feature barrel: re-exporting through one pulls nuqs into the server graph and breaks the build.

Rules for both sides, cited by heading in review: `CODING_STANDARDS.md`. Domain vocabulary, including which words to avoid: `CONTEXT.md`.

## Issues and specs

One feature per directory under `.scratch/<feature-slug>/`. The spec is `spec.md`; tickets are one file each at `issues/<NN>-<slug>.md`, numbered from `01`, never combined. Conversation appends under a `## Comments` heading.

Triage state is a `Status:` line near the top of each ticket:

| Role | Label |
| --- | --- |
| Needs triage | `status:triage` |
| Waiting on reporter | `status:needs-info` |
| Ready for an AFK agent | `status:ready-agent` |
| Needs a human | `status:ready-human` |
| Will not be actioned | `status:wontfix` |
