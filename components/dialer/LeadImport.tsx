"use client";

// Lead import with column mapping. Reads CSV or Excel (.xlsx/.xls), shows the
// file's own column headers, and lets the operator map which column is the
// phone / name / business before importing — so any export layout works, not
// just a fixed column order.

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Icon } from "./icons";

type Grid = string[][];

interface Parsed {
  fileName: string;
  headers: string[]; // display label per column (header row, or "Column 1"…)
  rows: Grid; // data rows only (header stripped when detected)
  hasHeader: boolean;
}

const FIELDS = [
  { key: "phone", label: "Phone number", required: true },
  { key: "name", label: "Name", required: false },
  { key: "business", label: "Business", required: false },
  { key: "industry", label: "Industry", required: false },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

const looksPhone = (v: string) => (v || "").replace(/\D/g, "").length >= 10;

function parseWorkbook(data: ArrayBuffer, fileName: string): Parsed {
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  }) as unknown as Grid;
  return toParsed(grid.map((r) => r.map((c) => String(c ?? "").trim())), fileName);
}

function toParsed(grid: Grid, fileName: string): Parsed {
  const rows = grid.filter((r) => r.some((c) => c !== ""));
  if (!rows.length) return { fileName, headers: [], rows: [], hasHeader: false };
  const cols = Math.max(...rows.map((r) => r.length));
  const first = rows[0];
  // Header row = a first row with no phone-looking cell (labels, not data).
  const hasHeader = !first.some(looksPhone);
  const headers = Array.from({ length: cols }, (_, i) =>
    hasHeader && first[i] ? first[i] : `Column ${i + 1}`
  );
  return { fileName, headers, rows: hasHeader ? rows.slice(1) : rows, hasHeader };
}

// Best-guess column for each field, so the common case needs no clicks.
function autoMap(p: Parsed): Record<FieldKey, number> {
  const map: Record<FieldKey, number> = { phone: -1, name: -1, business: -1, industry: -1 };
  const lower = p.headers.map((h) => h.toLowerCase());
  if (p.hasHeader) {
    map.phone = lower.findIndex((h) => /phone|number|cell|mobile|tel/.test(h));
    map.business = lower.findIndex((h) => /business|company|org|shop|store/.test(h));
    map.name = lower.findIndex((h) => /name|contact|owner/.test(h) && !/business|company/.test(h));
    map.industry = lower.findIndex((h) => /industry|category|type|niche|vertical/.test(h));
  }
  if (map.phone < 0) {
    // Column with the most phone-looking values.
    let best = -1, score = -1;
    for (let c = 0; c < p.headers.length; c++) {
      const s = p.rows.filter((r) => looksPhone(r[c] || "")).length;
      if (s > score) { score = s; best = c; }
    }
    map.phone = best;
  }
  const taken = new Set([map.phone, map.business, map.name, map.industry].filter((i) => i >= 0));
  if (map.name < 0) map.name = [...Array(p.headers.length).keys()].find((i) => !taken.has(i)) ?? -1;
  taken.add(map.name);
  if (map.business < 0) map.business = [...Array(p.headers.length).keys()].find((i) => !taken.has(i)) ?? -1;
  return map;
}

const inputCls = "dlr-select dlr-select-sm";

export default function LeadImport({
  onImport,
  onDone,
}: {
  onImport: (
    rows: { name: string; business: string; phone: string; industry: string }[],
    listName: string
  ) => Promise<{ added: number; updated: number; skipped: number } | null>;
  onDone: () => void;
}) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<Record<FieldKey, number>>({ phone: -1, name: -1, business: -1, industry: -1 });
  const [listName, setListName] = useState("");
  const [industryAll, setIndustryAll] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(async (file: File) => {
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const p = parseWorkbook(buf, file.name);
      // Every upload gets a list name by default (the file's name) so it's
      // always manageable — rename/delete as a whole — from the Leads tab.
      setListName((cur) => cur || file.name.replace(/\.[^.]+$/, "").slice(0, 80));
      if (!p.rows.length) {
        setError("That file has no rows we can read.");
        return;
      }
      setParsed(p);
      setMap(autoMap(p));
      setListName(file.name.replace(/\.(csv|xlsx|xls|txt)$/i, "").slice(0, 80));
    } catch {
      setError("Couldn't read that file. Use a .csv, .xlsx, or .xls export.");
    }
  }, []);

  const validPhones = parsed
    ? parsed.rows.filter((r) => map.phone >= 0 && looksPhone(r[map.phone] || "")).length
    : 0;

  const doImport = async () => {
    if (!parsed || map.phone < 0) return;
    setBusy(true);
    setError("");
    const rows = parsed.rows
      .map((r) => ({
        phone: r[map.phone] || "",
        name: map.name >= 0 ? r[map.name] || "" : "",
        business: map.business >= 0 ? r[map.business] || "" : "",
        industry: map.industry >= 0 ? r[map.industry] || "" : industryAll.trim(),
      }))
      .filter((r) => looksPhone(r.phone));
    const res = await onImport(rows, listName.trim());
    setBusy(false);
    if (res) {
      setParsed(null);
      onDone();
    }
  };

  const colOptions = (selfKey: FieldKey) => {
    const used = (Object.keys(map) as FieldKey[])
      .filter((k) => k !== selfKey)
      .map((k) => map[k]);
    return (parsed?.headers || []).map((h, i) => (
      <option key={i} value={i} disabled={used.includes(i)}>
        {h}
      </option>
    ));
  };

  if (!parsed) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) loadFile(f);
        }}
        className="dlr-drop"
        style={{ borderColor: dragOver ? "rgba(246,246,244,0.5)" : undefined, background: dragOver ? "rgba(246,246,244,0.05)" : undefined }}
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }}
        />
        <p style={{ color: "var(--smoke)" }}><Icon name="upload" size={24} /></p>
        <p style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>Drop a CSV or Excel file, or click to choose</p>
        <p className="dlr-sub" style={{ marginTop: 4 }}>.csv, .xlsx, or .xls — you&apos;ll map the columns next.</p>
        {error && <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--danger)" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <p className="dlr-sub" style={{ marginTop: 0 }}>
          <b style={{ color: "var(--paper)" }}>{parsed.fileName}</b> · {parsed.rows.length} rows
        </p>
        <button onClick={() => { setParsed(null); setError(""); }} className="dlr-btn" style={{ padding: "7px 12px" }}>
          Choose another file
        </button>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <span>
          <label className="dlr-label" style={{ display: "block", marginBottom: 4 }}>List name</label>
          <input value={listName} onChange={(e) => setListName(e.target.value.slice(0, 80))} placeholder="e.g. GA Plumbers July" className="dlr-input" style={{ width: 240 }} />
        </span>
        {map.industry < 0 && (
          <span>
            <label className="dlr-label" style={{ display: "block", marginBottom: 4 }}>Industry for this whole list (optional)</label>
            <input value={industryAll} onChange={(e) => setIndustryAll(e.target.value.slice(0, 80))} placeholder="e.g. Plumbing" className="dlr-input" style={{ width: 200 }} />
          </span>
        )}
      </div>

      <p className="dlr-label" style={{ marginTop: 16, marginBottom: 8 }}>Map your columns</p>
      <div style={{ display: "grid", gap: 10 }}>
        {FIELDS.map((f) => (
          <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ width: 120, fontSize: 13 }}>
              {f.label}{f.required && <span style={{ color: "var(--danger)" }}> *</span>}
            </span>
            <select
              value={map[f.key]}
              onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
              className={inputCls}
            >
              <option value={-1}>{f.required ? "— select —" : "— none —"}</option>
              {colOptions(f.key)}
            </select>
            {map[f.key] >= 0 && parsed.rows[0]?.[map[f.key]] && (
              <span className="dlr-sub" style={{ marginTop: 0, fontSize: 11.5 }}>
                e.g. “{parsed.rows[0][map[f.key]]}”
              </span>
            )}
          </div>
        ))}
      </div>

      {/* preview */}
      <p className="dlr-label" style={{ marginTop: 18, marginBottom: 8 }}>Preview</p>
      <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr>
              {FIELDS.map((f) => (
                <th key={f.key} style={{ textAlign: "left", padding: "8px 12px", color: "var(--smoke)", borderBottom: "1px solid var(--line)", fontWeight: 600 }}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.slice(0, 4).map((r, i) => (
              <tr key={i}>
                {FIELDS.map((f) => (
                  <td key={f.key} style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", color: map[f.key] >= 0 ? "var(--paper)" : "var(--smoke-d)" }}>
                    {map[f.key] >= 0 ? r[map[f.key]] || "—" : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--danger)" }}>{error}</p>}
      {map.phone < 0 ? (
        <p className="dlr-sub" style={{ marginTop: 12 }}>Pick which column holds the phone number to import.</p>
      ) : (
        <p className="dlr-sub" style={{ marginTop: 12 }}>{validPhones} of {parsed.rows.length} rows have a valid phone number.</p>
      )}

      <button onClick={doImport} disabled={busy || map.phone < 0 || validPhones === 0} className="dlr-btn primary" style={{ marginTop: 12 }}>
        {busy ? "Importing…" : `Import ${validPhones} lead${validPhones === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
