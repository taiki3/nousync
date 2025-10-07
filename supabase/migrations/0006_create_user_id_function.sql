-- Create a function to get current user ID from JWT claims
CREATE OR REPLACE FUNCTION public.get_current_user_id() 
RETURNS uuid 
LANGUAGE sql 
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  )::uuid;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_current_user_id() TO authenticated, anon;
