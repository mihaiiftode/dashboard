# Frontend is one feature module behind a thin route

The web client is one `deployments` feature under `features/deployments`, organised by concept into `pages`, `components`, `hooks`, `query`, and `store`, with `main.ts` as its only public surface. The Next.js route file stays thin: it reads the `q` search parameter through a nuqs parser and renders `DeploymentsPage` with plain props. The page and every presentational component receive data and callbacks as props and never import the router, the store, or `notify`. One container hook binds the store and hands props down. Column definitions come from one factory over the field schema, each cell renderer is its own file taking a value and an `onCommit` callback, and every editable control carries `data-slot` so click forwarding and tests select on a stable hook rather than a class, title, or text. One boundary component per feature root renders loading, error, and empty states. Cross-feature infrastructure lives in `lib`, the application shell in `components/shell`, and shadcn registry files verbatim in `components/ui`. Tests are colocated `*.spec` files rendered through a shared harness that wraps providers and the fake API store, drives input with delays disabled, and stubs the jsdom gaps Base UI needs. This layout lands as a pure refactor before the data layer so every later ticket builds on it.

## Considered Options

- Flat `components/deployments` with one view component owning all state, as the prototype shipped. Fastest to write, but the view grew to own rows, query, columns, pending state, edits, delete, and restore, the table reached the DOM by `title` attribute, and nothing could be rendered in a test without the router. The store would have landed on top of that.
- Keeping router reads inside the page and mirroring `q` with `history.replaceState`. Simpler on paper, but it gives no back and forward integration, validates nothing, and couples every page test to a router context.

## Consequences

- `features/deployments/main.ts` exports the page; the route file is the only consumer. Deep imports into the feature are a review failure.
- Pages and presentational components render in tests with props alone. The container hook is the single seam over the store.
- Column and renderer changes touch one factory or one file, and sort and filter keep working on the real value because decoration rides the value column.
- nuqs owns URL serialisation, so back, forward, and reload restore the view, and `q` stays the only parameter.
- The test harness is a prerequisite for every Base UI component test; component tickets depend on the refactor ticket that introduces it.
- Rationale for non-obvious constants and workarounds goes into the ticket or an ADR, not a code comment, keeping the no-comments rule intact.
