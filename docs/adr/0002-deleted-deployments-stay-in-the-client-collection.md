# Deleted Deployments stay in the client collection

The dashboard is one table with a query bar, and the deleted scope, restore, and Undo must be as instant as every other interaction. Replication therefore pulls Deleted Deployments as ordinary documents carrying `deleted_at`. The default scope hides them with a where clause, `is:deleted` shows only them, and restore and delete are optimistic local writes that the push handler maps to the delete and restore endpoints by how `deleted_at` changed. RxDB's own deleted flag is never set for a soft delete. Because the MongoDB TTL purge emits no change event, the client also hides any row whose `deleted_at` is older than the retention window. This supersedes the ADR 0001 consequence that deleted records are hidden by RxDB and read through a separate REST call.

## Considered Options

- API-fed deleted scope, as ADR 0001 first described. Keeps the local store smaller, but switching scope costs a round trip, restore waits for the stream, and Undo cannot be optimistic. Two data paths would feed one table.

## Consequences

- The list endpoint always includes Deleted Deployments for replication. A deleted-only listing is no longer needed.
- Deleted rows are roughly one percent of the data and stay in IndexedDB until the client hides them. Local garbage collection of purged rows is out of scope.
- Trash as a separate view is retired. The glossary defines the deleted scope instead.
