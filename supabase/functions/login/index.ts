import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { cnic: rawCnic, password } = await req.json().catch(() => ({}));
    const cnic = String(rawCnic ?? "").replace(/\D/g, "");
    if (cnic.length !== 13 || !password) return json({ error: "Enter a valid 13-digit CNIC and password" }, 400);

    const AIDB_URL = Deno.env.get("AIDB_URL")!;
    const AIDB_ANON = Deno.env.get("AIDB_ANON_KEY")!;
    const AIDB_SERVICE = Deno.env.get("AIDB_SERVICE_ROLE_KEY")!;
    if (!AIDB_URL || !AIDB_ANON || !AIDB_SERVICE) return json({ error: "Server not configured" }, 500);

    // 1) Verify credentials against A-I-DB (password grant)
    const tok = await fetch(`${AIDB_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: AIDB_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${cnic}@placeholder.internal`, password }),
    });
    if (!tok.ok) return json({ error: "Invalid CNIC or password" }, 401);

    // 2) Look up jurisdiction/role (service-role only RPC). Try known param names.
    let jur: any = null;
    for (const body of [{ p_cnic: cnic }, { cnic }]) {
      const r = await fetch(`${AIDB_URL}/rest/v1/rpc/get_jurisdiction_for_smp`, {
        method: "POST",
        headers: { apikey: AIDB_SERVICE, Authorization: `Bearer ${AIDB_SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) { jur = await r.json(); break; }
    }
    if (Array.isArray(jur)) jur = jur[0];
    if (!jur) return json({ error: "No A-I-DB profile found for this CNIC" }, 403);

    // Only A-I-DB admins get approval rights; everyone else is a viewer (RLS shows them nothing).
    const role = String(jur.role ?? "").toLowerCase() === "admin" ? "admin" : "viewer";
    const fullName = jur.full_name ?? jur.name ?? null;

    // 3) Find-or-create shadow user in THIS project, refresh profile, mint session
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const email = `${cnic}@daak.local`;
    await admin.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID() });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data?.user) return json({ error: "Could not start session" }, 500);
    const userId = link.data.user.id;

    const up = await admin.from("profiles").upsert({ id: userId, cnic, full_name: fullName, role }, { onConflict: "id" });
    if (up.error) return json({ error: "Could not save profile" }, 500);

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const v = await anon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
    if (v.error || !v.data.session) return json({ error: "Could not start session" }, 500);

    await admin.from("audit_logs").insert({ actor_id: userId, event_type: "login", object_type: "profile", object_id: userId, details_json: { role } });

    return json({ access_token: v.data.session.access_token, refresh_token: v.data.session.refresh_token, role });
  } catch (_e) {
    return json({ error: "Login failed" }, 500);
  }
});
