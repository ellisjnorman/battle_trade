-- Enable RLS on chat_messages and add permissive policies
-- This ensures chat works even when using anon key (no service role key)

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read chat messages (lobby chat is public)
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (true);

-- Anyone can insert (auth is handled at the API layer)
CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (true);
