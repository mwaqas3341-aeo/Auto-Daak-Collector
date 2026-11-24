import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function googleToken(): Promise<string | null> {
  const id = Deno.env.get("GOOGLE_CLIENT_ID");
  const secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refresh = Deno.env.get("GOOGLE_READ_REFRESH_TOKEN");
  if (!id || !secret || !refresh) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  if (!r.ok) return null;
  return (await r.json()).access_token ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // 1) Caller must be a signed-in admin of this project
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const adm = await userClient.rpc("fn_is_admin");
    if (adm.error || adm.data !== true) return json({ error: "Admin only" }, 403);

    // 2) Validate the link
    const { url } = await req.json().catch(() => ({}));
    const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(String(url ?? ""));
    if (!m) return json({ error: "Not a Google Sheets link" }, 400);
    const sid = m[1];

    // 3) Google access (read-only token)
    const token = await googleToken();
    if (!token) return json({ error: "Google access not configured" }, 500);
    const gh = { Authorization: `Bearer ${token}` };

    const meta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}?fields=properties.title,sheets.properties(sheetId,title,gridProperties)`,
      { headers: gh },
    );
    if (meta.status === 403 || meta.status === 404) return json({ error: "No access to this spreadsheet with the connected Google account" }, 403);
    if (!meta.ok) return json({ error: `Google error ${meta.status}` }, 502);
    const md = await meta.json();

    // 4) Load enabled mappings once
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const mp = await svc.from("column_mappings").select("normalized_heading,source_table,source_field,match_rule").eq("enabled", true);
    if (mp.error) return json({ error: "Could not load mappings" }, 500);
    const byHeading = new Map<string, any[]>();
    for (const r of mp.data ?? []) {
      const a = byHeading.get(r.normalized_heading) ?? [];
      a.push(r); byHeading.set(r.normalized_heading, a);
    }

    // 5) For each worksheet read the first rows, pick the best header row, map headings
    const sheets: any[] = [];
    for (const s of (md.sheets ?? []).slice(0, 10)) {
      const t = s.properties.title as string;
      const range = encodeURIComponent(`'${t.replace(/'/g, "''")}'!1:15`);
      const vr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}`, { headers: gh });
      const rows: string[][] = vr.ok ? ((await vr.json()).values ?? []) : [];
      let best = -1, bestScore = 0;
      rows.forEach((row, i) => {
        const score = row.filter((c) => byHeading.has(norm(c))).length;
        if (score > bestScore) { bestScore = score; best = i; }
      });
      const headers = best >= 0 ? rows[best] : [];
      sheets.push({
        title: t,
        sheet_id: s.properties.sheetId,
        rows: s.properties.gridProperties?.rowCount,
        cols: s.properties.gridProperties?.columnCount,
        header_row: best >= 0 ? best + 1 : null,
        columns: headers.map((h, idx) => ({
          index: idx, heading: h, normalized: norm(h),
          mapped: byHeading.has(norm(h)),
          sources: (byHeading.get(norm(h)) ?? []).map((x) => `${x.source_table}.${x.source_field}`),
        })),
        unmapped_headings: headers.filter((h) => h && !byHeading.has(norm(h))),
      });
    }

    return json({ spreadsheet_id: sid, title: md.properties?.title, sheets, read_only: true });
  } catch (_e) {
    return json({ error: "Reader failed" }, 500);
  }
});
