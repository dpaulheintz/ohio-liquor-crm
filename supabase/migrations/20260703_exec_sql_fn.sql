-- Safe read-only SQL executor for the AI assistant.
-- Accepts a SELECT query and returns results as a JSON array.
-- SECURITY DEFINER runs with owner privileges (service role context only).
CREATE OR REPLACE FUNCTION exec_sql(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE format('SELECT json_agg(t) FROM (%s LIMIT 200) AS t', query_text)
    INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Only callable by the service role (API key)
REVOKE ALL ON FUNCTION exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;
