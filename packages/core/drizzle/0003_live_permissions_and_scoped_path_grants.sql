-- Permission mode is evaluated from the thread when each tool call starts.
ALTER TABLE turn_requests DROP COLUMN permission_mode;

-- External filesystem approvals and grants distinguish reads from writes.
ALTER TABLE approvals ADD COLUMN requested_access TEXT;
ALTER TABLE path_grants ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'read';
ALTER TABLE path_grants ADD COLUMN is_directory INTEGER NOT NULL DEFAULT 0;
UPDATE path_grants SET is_directory = 1;
