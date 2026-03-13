-- Add onboarding_complete flag to profiles (prevents credit bonus farming)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
