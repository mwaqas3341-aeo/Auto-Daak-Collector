import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const colLetter = (i: number) => {
  let s = ""; let n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};
const MAX_COLS = 52;

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

type Merge = { r1: number; r2: number; c1: number; c2: number }; // 0-based, inclusive

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

    // 2) Validate input
    const body = await req.json().catch(() => ({}));
    const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(String(body.url ?? ""));
    if (!m) return json({ error: "Not a Google Sheets link" }, 400);
    const sid = m[1];
    const action = body.action === "map" ? "map" : "preview";

    let headerRow = 0, dataStart = 0;
    if (action === "map") {
      headerRow = Number(body.header_row); dataStart = Number(body.data_start_row);
      if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 200) return json({ error: "header_row must be 1-200" }, 400);
      if (!Number.isInteger(dataStart) || dataStart <= headerRow || dataStart > 200) return json({ error: "data_start_row must be after header_row (max 200)" }, 400);
    }

    // 3) Google access (read-only token)
    const token = await googleToken();
    if (!token) return json({ error: "Google access not configured" }, 500);
    const gh = { Authorization: `Bearer ${token}` };

    const meta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}?fields=properties.title,sheets(properties(sheetId,title,gridProperties),merges)`,
      { headers: gh },
    );
    if (meta.status === 403 || meta.status === 404) return json({ error: "No access to this spreadsheet with the connected Google account" }, 403);
    if (!meta.ok) return json({ error: `Google error ${meta.status}` }, 502);
    const md = await meta.json();
    const sheetList = (md.sheets ?? []).map((s: any) => s.properties);
    if (!sheetList.length) return json({ error: "Spreadsheet has no worksheets" }, 400);
    const chosen = body.sheet ? (md.sheets ?? []).find((s: any) => s.properties.title === body.sheet) : md.sheets[0];
    if (!chosen) return json({ error: "Worksheet not found" }, 400);
    const title = chosen.properties.title as string;
    const colCount = Math.min(chosen.properties.gridProperties?.columnCount ?? 26, MAX_COLS);
    const rowCount = chosen.properties.gridProperties?.rowCount ?? 1000;
    const merges: Merge[] = (chosen.merges ?? []).map((x: any) => ({
      r1: x.startRowIndex, r2: x.endRowIndex - 1, c1: x.startColumnIndex, c2: x.endColumnIndex - 1,
    }));
    const mergeAt = (r: number, c: number) => merges.find((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);

    // 4) Read the top rows (leading empty rows come back as empty arrays)
    const maxRow = Math.min(action === "map" ? dataStart + 2 : 25, rowCount);
    const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'!A1:${colLetter(colCount - 1)}${maxRow}`);
    const vr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}`, { headers: gh });
    if (!vr.ok) return json({ error: `Google error ${vr.status}` }, 502);
    const grid: string[][] = ((await vr.json()).values ?? []).map((row: unknown[]) =>
      Array.from({ length: colCount }, (_, i) => String(row[i] ?? "")));
    while (grid.length < maxRow) grid.push(Array(colCount).fill(""));

    // value at a cell; a covered cell of a merged range takes the anchor's value
    const resolve = (r: number, c: number) => {
      const v = grid[r]?.[c] ?? "";
      if (v !== "") return v;
      const mg = mergeAt(r, c);
      return mg ? (grid[mg.r1]?.[mg.c1] ?? "") : "";
    };

    // 5) Mappings
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const mp = await svc.from("column_mappings").select("normalized_heading,source_table,source_field").eq("enabled", true);
    if (mp.error) return json({ error: "Could not load mappings" }, 500);
    const byHeading = new Map<string, any[]>();
    for (const r of mp.data ?? []) {
      const a = byHeading.get(r.normalized_heading) ?? [];
      a.push(r); byHeading.set(r.normalized_heading, a);
    }

    const sheetsOut = sheetList.map((p: any) => ({ title: p.title, sheet_id: p.sheetId, rows: p.gridProperties?.rowCount, cols: p.gridProperties?.columnCount }));

    // ---------- preview: raw top rows, merged ranges, a suggested header row ----------
    if (action === "preview") {
      let lastCol = 0;
      for (let r = 0; r < maxRow; r++) for (let c = 0; c < colCount; c++) if (resolve(r, c) !== "") lastCol = Math.max(lastCol, c);
      const ncols = lastCol + 1;
      let suggested: number | null = null, bestScore = 0;
      for (let r = 0; r < maxRow; r++) {
        let score = 0;
        for (let c = 0; c < ncols; c++) if (byHeading.has(norm(resolve(r, c)))) score++;
        if (score > bestScore) { bestScore = score; suggested = r + 1; }
      }
      return json({
        spreadsheet_id: sid, title: md.properties?.title, sheets: sheetsOut, sheet: title,
        preview: grid.slice(0, maxRow).map((row, i) => ({ row: i + 1, cells: row.slice(0, ncols) })),
        merges: merges.filter((x) => x.r1 < maxRow && x.c1 < ncols).map((x) => ({
          r1: x.r1 + 1, r2: Math.min(x.r2, maxRow - 1) + 1, c1: x.c1, c2: Math.min(x.c2, ncols - 1),
        })),
        suggested_header_row: suggested, read_only: true,
      });
    }

    // ---------- map: use the header row and first data row chosen by the admin ----------
    const hr = headerRow - 1;
    let lastHead = -1;
    for (let c = 0; c < colCount; c++) if (resolve(hr, c) !== "") lastHead = c;
    const columns: any[] = [];
    for (let c = 0; c <= lastHead; c++) {
      const heading = resolve(hr, c);
      const mg = mergeAt(hr, c);
      const continuation = !!mg && mg.c1 < mg.c2 && c !== mg.c1; // 2nd+ column of a horizontal merge
      const usable = heading !== "" && !continuation;
      const key = norm(heading);
      columns.push({
        index: c, letter: colLetter(c), heading, normalized: key, usable,
        merged: mg ? (continuation ? "continuation" : (mg.c1 < mg.c2 || mg.r1 < mg.r2 ? "anchor" : null)) : null,
        mapped: usable && byHeading.has(key),
        sources: usable ? (byHeading.get(key) ?? []).map((x) => `${x.source_table}.${x.source_field}`) : [],
      });
    }
    const usableCols = new Set(columns.filter((x) => x.usable).map((x) => x.index));
    const dataMerges = merges.filter((x) => x.r2 >= dataStart - 1);
    const affected = [...new Set(dataMerges.flatMap((x) => {
      const out: string[] = [];
      for (let c = x.c1; c <= x.c2; c++) if (usableCols.has(c)) out.push(colLetter(c));
      return out;
    }))];
    const firstData = [];
    for (let r = dataStart - 1; r < Math.min(dataStart + 2, maxRow); r++) {
      firstData.push({ row: r + 1, cells: columns.map((x) => resolve(r, x.index)) });
    }
    const warnings: string[] = [];
    if (!columns.some((x) => x.usable)) warnings.push("The header row you chose has no headings. Check the row number.");
    else if (!columns.some((x) => x.mapped)) warnings.push("None of the headings in this row match a known field. Check the header row number.");
    if (firstData.length && firstData.every((d) => d.cells.every((v) => v === ""))) warnings.push("The first data rows look empty. They may be further down, or the sheet has no data yet.");
    if (columns.some((x) => x.merged === "continuation")) warnings.push("Some header cells are merged across columns. Only the first column of each merge is used; the others are skipped.");
    if (affected.length) warnings.push(`Merged cells exist in the data area for columns: ${affected.join(", ")}. Updates can only target the first cell of a merge.`);

    return json({
      spreadsheet_id: sid, title: md.properties?.title, sheet: title,
      header_row: headerRow, data_start_row: dataStart, columns,
      unmapped_headings: columns.filter((x) => x.usable && !x.mapped).map((x) => x.heading),
      data_merges: dataMerges.slice(0, 20).map((x) => `${colLetter(x.c1)}${x.r1 + 1}:${colLetter(x.c2)}${x.r2 + 1}`),
      first_data_rows: firstData, warnings, read_only: true,
    });
  } catch (_e) {
    return json({ error: "Reader failed" }, 500);
  }
});
