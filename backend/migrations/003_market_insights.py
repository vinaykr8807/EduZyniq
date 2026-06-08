from supabase_client import supabase

sql_commands = """
CREATE TABLE IF NOT EXISTS public.market_insights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id),
    role text NOT NULL,
    domain text NOT NULL,
    type text NOT NULL,
    result jsonb,
    evidence_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.market_insights ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE public.market_insights ADD COLUMN IF NOT EXISTS evidence_count integer DEFAULT 0;
"""

# Since we don't have a direct SQL executor in this environment's Supabase client easily,
# we'll use a hack or just assume the user can run this if they see it.
# Actually, I can try to run it via an rpc if defined, but usually it's not.
# Instead, I'll just write it down and let the user know.

if __name__ == "__main__":
    print("Market Insights table migration generated.")
    print("Please execute the following SQL in the Supabase Dashboard SQL Editor:")
    print(sql_commands)
