# RxDB replication under TanStack DB for the client data layer

All deployments live in the browser so that every search, filter, sort, and group runs locally, because the brief requires instant results with no per-keystroke round-trips. RxDB with the Dexie.js storage owns persistence and replication: checkpoint-based pull for initial load and catch-up, a server-sent events stream for live changes from other users, and push with server-side conflict detection on `updated_at`. TanStack DB sits on top through the RxDB collection adapter and owns live queries and React binding. Writing this by hand as a custom TanStack DB collection would reimplement roughly half of the RxDB replication protocol.

## Considered Options

- Custom TanStack DB collection with a hand-written sync function over SSE and the wa-sqlite persistence wrapper. One dependency fewer, but reconnect, buffering, delta, confirmation, and conflict handling all become bespoke code.
- TanStack DB query collection over TanStack Query with direct writes for SSE events. Direct writes bypass the mutation handlers and fight the collection's own sync path.
- Plain TanStack Query with polling. Simplest, but every freshness and cache path is hand-written and multi-user staleness is bounded by the poll interval.
- MongoDB change streams feeding SSE. Catches writes that bypass the API, but needs a replica set in the local compose file.

## Consequences

- The REST API stays conventional. The RxDB push handler maps each change row to a single-resource update and returns 409 bodies as conflicts. The pull handler maps to a list endpoint filtered by `updated_since` that includes soft-deleted records so clients can evict them.
- Soft-deleted records were first planned to carry `_deleted: true` and be read through a separate REST call. Superseded by ADR 0002: they replicate as ordinary documents with `deleted_at` and the client filters them.
- The SSE fan-out is in-process. More than one API instance requires a shared broker or change streams.
- Two data libraries on a 5k-row dashboard is deliberate. The adapter module is the only place that knows about RxDB replication.
