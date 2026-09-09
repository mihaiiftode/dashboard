# Deployments Dashboard

Internal dashboard for a platform team to browse, search, edit, and recover deployment records.

## Language

**Deployment**:
A record of one service instance deployed to an environment, identified by its deployment ID and carrying a version, three facets, and attributes.
_Avoid_: release, service, record

**Facet**:
One of the three fixed classification fields every deployment has: Status, Type, Environment. Facets narrow the list; they are not attributes.
_Avoid_: category, filter field, tag

**Status**:
Facet with values active, failed, stopped.

**Type**:
Facet with values web_service, worker, cron_job.

**Environment**:
Facet with values production, staging, development.

**Attribute**:
A user-defined key with a text value on a deployment. Attributes are viewed, added, edited, and removed by users and searched by value.
_Avoid_: tag, label, metadata, property, custom field

**Name**:
The attribute every deployment must carry: the human-readable service name shown in the list. Editable, never removable.
_Avoid_: title, service name, label

**Description**:
Optional attribute holding free text about the deployment. Editable inline alongside Name.
_Avoid_: summary, notes

**Creator**:
The email address of the person who created the deployment. Searchable, not editable.
_Avoid_: owner, author

**Deleted Deployment**:
A deployment a user removed from the list. Hidden by default, recoverable for 30 days, then gone for good.
_Avoid_: archived, soft-deleted, trashed, removed

**Scope**:
Which deployments the list shows: live deployments by default, deleted deployments when the query asks for them.
_Avoid_: trash, view, mode, tab, recycle bin

**Restore**:
Returning a deleted deployment to the list unchanged.
_Avoid_: undelete, recover, undo

**Query**:
The text in the query bar that filters, groups, and sorts the list. Made of tokens.
_Avoid_: search string, filter string

**Token**:
One unit of a query: bare text, a field with a value, or a directive that sets scope, grouping, or sort.
_Avoid_: term, clause, chip

**Field**:
Something a deployment row can show, group by, or filter on: a fixed property such as Status or Creator, or an Attribute key.
_Avoid_: column, property, key

**Chip Field**:
An Attribute with twelve or fewer distinct values across the current rows, shown and edited as coloured chips.
_Avoid_: enum attribute, tag, label

**Fields Panel**:
The side panel listing every Field with its coverage, where the user chooses which Fields are columns and which one groups the rows.
_Avoid_: column picker, settings, sidebar
