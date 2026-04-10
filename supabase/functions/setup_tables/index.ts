import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? ""
  if (!auth.includes("Bearer")) return new Response("Unauthorized", { status: 401 })

  const url  = Deno.env.get("SUPABASE_URL")!
  const key  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const supabase = createClient(url, key)

  const { data, error } = await supabase.rpc("exec_setup_sql")
  if (error) return new Response(JSON.stringify({ error }), { status: 500 })
  return new Response(JSON.stringify({ ok: true, data }), { status: 200 })
})
