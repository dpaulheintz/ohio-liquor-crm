-- Drop stale triggers that still referenced the now-removed organization_id column.
-- These were installed by the multi-tenant scaffold and were not dropped when
-- organization_id was removed, causing every INSERT on contacts, visit_logs,
-- accounts, and assignments to fail with a column-not-found error.

DROP TRIGGER IF EXISTS trg_set_org_contacts    ON contacts;
DROP TRIGGER IF EXISTS trg_set_org_accounts    ON accounts;
DROP TRIGGER IF EXISTS trg_set_org_visit_logs  ON visit_logs;
DROP TRIGGER IF EXISTS trg_set_org_assignments ON assignments;

DROP FUNCTION IF EXISTS set_organization_id() CASCADE;
