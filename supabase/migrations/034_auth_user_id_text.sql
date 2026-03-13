-- Privy user IDs are strings (did:privy:...), not UUIDs
ALTER TABLE profiles ALTER COLUMN auth_user_id TYPE text USING auth_user_id::text;
