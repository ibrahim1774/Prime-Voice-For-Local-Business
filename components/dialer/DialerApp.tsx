"use client";

// /dialer — "Command": password-protected power dialer.
//
// Phone-bridge architecture: a session calls the agent's cell once, then each
// wave dials 1-3 queued leads simultaneously from the local-presence pool.
// The first lead to answer is bridged in; losers get a polite message and are
// re-queued. Marking a call auto-fires the next wave.

import { useCallback, useEffect, useRef, useState } from "react";

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "#8a8a92" },
  interested: { label: "Interested", color: "#34d399" },
  callback: { label: "Callback", color: "#fbbf24" },
  voicemail: { label: "Voicemail", color: "#a78bfa" },
  no_answer: { label: "No answer", color: "#94a3b8" },
  not_interested: { label: "Not interested", color: "#f87171" },
  wrong_number: { label: "Wrong number", color: "#fb923c" },
  dnc: { label: "DNC", color: "#ef4444" },
};
const DISPOSITIONS = [
  "interested",
  "callback",
  "voicemail",
  "no_answer",
  "not_interested",
  "wrong_number",
  "dnc",
];

async function api(path: string, options?: RequestInit): Promise<any> {
  const resp = await fetch(`/api/dialer/${path}`, {
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  const json = await resp.json().catch(() => ({}));
  if (resp.status === 401) throw new Error("__auth__");
  if (!resp.ok) throw new Error(json?.error || `Request failed (${resp.status})`);
  return json;
}

function fmtPhone(p: string): string {
  const m = (p || "").match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p || "";
}
function timeAgo(ts: string): string {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
function mergeTemplate(t: string, lead: any): string {
  return t
    .replace(/\{\{\s*name\s*\}\}/gi, lead?.name || "there")
    .replace(/\{\{\s*business\s*\}\}/gi, lead?.business || "your business");
}

// CSV / paste parser with quoted fields + smart column detection.
function parseLeadsText(text: string): { name: string; business: string; phone: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === "," || ch === "\t") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const rows = lines.map(parseLine);
  const looksPhone = (v: string) => (v || "").replace(/\D/g, "").length >= 10;
  let phoneCol = -1, nameCol = -1, bizCol = -1, start = 0;
  const header = rows[0].map((h) => h.toLowerCase());
  if (header.some((h) => /phone|number|cell|mobile|tel/.test(h)) && !rows[0].some(looksPhone)) {
    start = 1;
    phoneCol = header.findIndex((h) => /phone|number|cell|mobile|tel/.test(h));
    nameCol = header.findIndex((h) => /name|contact|owner/.test(h) && !/business|company/.test(h));
    bizCol = header.findIndex((h) => /business|company|org|shop/.test(h));
  } else {
    const cols = Math.max(...rows.map((r) => r.length));
    let best = -1, bestScore = -1;
    for (let c = 0; c < cols; c++) {
      const score = rows.filter((r) => looksPhone(r[c] || "")).length;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    phoneCol = best;
    const others = Array.from({ length: cols }, (_, i) => i).filter((i) => i !== phoneCol);
    nameCol = others[0] ?? -1;
    bizCol = others[1] ?? -1;
  }
  if (phoneCol < 0) return [];
  return rows
    .slice(start)
    .map((r) => ({
      phone: r[phoneCol] || "",
      name: nameCol >= 0 ? r[nameCol] || "" : "",
      business: bizCol >= 0 ? r[bizCol] || "" : "",
    }))
    .filter((r) => looksPhone(r.phone));
}

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.new;
  return (
    <span className="dlr-pill" style={{ color: m.color, borderColor: `${m.color}55`, background: `${m.color}12` }}>
      {m.label}
    </span>
  );
}

function Wave() {
  return (
    <div className="dlr-wave" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${(i % 5) * 0.11}s`, animationDuration: `${0.85 + ((i * 3) % 4) * 0.12}s` }} />
      ))}
    </div>
  );
}

export default function DialerApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<"dial" | "leads" | "texts" | "calls" | "numbers">("dial");
  const [toast, setToast] = useState("");

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3600);
  }, []);
  const guard = useCallback((err: any) => {
    if (err?.message === "__auth__") setAuthed(false);
    else notify(err?.message || "Something went wrong");
  }, [notify]);

  // ── settings ──
  const [agentPhone, setAgentPhone] = useState("");
  const [vmScript, setVmScript] = useState("");
  const [templates, setTemplates] = useState<string[]>([]);
  const [lines, setLines] = useState(1);
  const loadSettings = useCallback(async () => {
    const s = await api("settings");
    setAgentPhone(s.agentPhone || "");
    setVmScript(s.vmScript || "");
    setTemplates(s.templates || []);
    setLines(s.lines || 1);
  }, []);
  useEffect(() => {
    loadSettings().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, [loadSettings]);

  const login = async () => {
    setLoginError("");
    try {
      await api("login", { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      await loadSettings();
      setAuthed(true);
    } catch (err: any) {
      setLoginError(err?.message === "__auth__" ? "Wrong password" : err?.message || "Login failed");
    }
  };

  // ── session ──
  const [session, setSession] = useState<any>({ active: false });
  const [queue, setQueue] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [autoDial, setAutoDial] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const [pending, setPending] = useState<any>(null); // lead awaiting a mark
  const [busy, setBusy] = useState(false);
  const [dialing, setDialing] = useState(false);

  const refs = useRef({ autoDial, handsFree, pending, session, dialing });
  refs.current = { autoDial, handsFree, pending, session, dialing };

  const loadQueue = useCallback(async () => {
    try {
      const data = await api("leads?queue=1&limit=12");
      setQueue(data.leads || []);
      const c: Record<string, number> = {};
      (data.counts || []).forEach((r: any) => (c[r.status] = r.n));
      setCounts(c);
    } catch (err) { guard(err); }
  }, [guard]);
  useEffect(() => { if (authed) loadQueue(); }, [authed, loadQueue]);

  const fireWave = useCallback(async (leadId?: number) => {
    if (refs.current.dialing) return;
    setDialing(true);
    try {
      await api("dial", { method: "POST", body: JSON.stringify(leadId ? { leadId } : {}) });
    } catch (err: any) {
      if (err?.message?.includes("Queue is empty")) notify("Queue is empty — add more leads");
      else guard(err);
    } finally {
      setDialing(false);
      loadQueue();
    }
  }, [guard, notify, loadQueue]);

  // Poll session; auto-advance when a wave ends.
  useEffect(() => {
    if (!authed) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api("session");
        if (stop) return;
        setSession(s);
        if (!s.active) { setPending(null); return; }

        if (s.winnerLead) {
          setPending((prev: any) => (prev?.id === s.winnerLead.id ? prev : s.winnerLead));
        }
        // Wave finished: winner's call ended (or nobody answered).
        if (!s.waveActive && !refs.current.dialing) {
          const needsMark = Boolean(s.winnerLead);
          if (!needsMark && s.agentAnswered && refs.current.autoDial) {
            setPending(null);
            fireWave();
          } else if (needsMark && refs.current.handsFree && refs.current.autoDial) {
            fireWave();
          }
        }
      } catch (err: any) {
        if (err?.message === "__auth__") setAuthed(false);
      }
    };
    tick();
    const iv = setInterval(tick, 1600);
    return () => { stop = true; clearInterval(iv); };
  }, [authed, fireWave]);

  // Auto-dial the first wave as soon as the agent picks up their phone.
  const kickedRef = useRef(false);
  useEffect(() => {
    if (!session.active) { kickedRef.current = false; return; }
    if (session.agentAnswered && !session.waveActive && !session.winnerLead && !kickedRef.current && autoDial) {
      kickedRef.current = true;
      fireWave();
    }
  }, [session.active, session.agentAnswered, session.waveActive, session.winnerLead, autoDial, fireWave]);

  const startSession = async () => {
    setBusy(true);
    try {
      await api("session", { method: "POST", body: JSON.stringify({ action: "start" }) });
      notify("📞 Answer your phone — dialing starts automatically");
    } catch (err) { guard(err); } finally { setBusy(false); }
  };
  const stopSession = async () => {
    setBusy(true);
    try {
      await api("session", { method: "POST", body: JSON.stringify({ action: "stop" }) });
      setPending(null);
      setSession({ active: false });
    } catch (err) { guard(err); } finally { setBusy(false); }
  };
  const callAction = async (action: "vmdrop" | "hangup") => {
    try {
      await api("call-action", { method: "POST", body: JSON.stringify({ action }) });
      if (action === "vmdrop") notify("Voicemail dropping…");
    } catch (err) { guard(err); }
  };

  const mark = async (status: string, alsoText?: string) => {
    if (!pending) return;
    const lead = pending;
    try {
      await api(`leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (alsoText) {
        await api("sms", { method: "POST", body: JSON.stringify({ phone: lead.phone, body: mergeTemplate(alsoText, lead) }) })
          .then(() => notify(`Marked ${STATUS_META[status].label} · text sent`))
          .catch((err) => notify(`Marked, but text failed: ${err.message}`));
      }
      setPending(null);
      loadQueue();
      if (autoDial && refs.current.session?.active && !refs.current.session?.waveActive) {
        setTimeout(() => fireWave(), 500);
      }
    } catch (err) { guard(err); }
  };

  const quickText = async (template: string) => {
    if (!pending) return;
    try {
      await api("sms", { method: "POST", body: JSON.stringify({ phone: pending.phone, body: mergeTemplate(template, pending) }) });
      notify("Text sent ✓");
    } catch (err) { guard(err); }
  };

  // ── leads ──
  const [leads, setLeads] = useState<any[]>([]);
  const [leadFilter, setLeadFilter] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const [expandedLead, setExpandedLead] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const loadLeads = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (leadFilter) p.set("status", leadFilter);
      if (leadSearch.trim()) p.set("search", leadSearch.trim());
      const data = await api(`leads?${p}`);
      setLeads(data.leads || []);
      const c: Record<string, number> = {};
      (data.counts || []).forEach((r: any) => (c[r.status] = r.n));
      setCounts(c);
    } catch (err) { guard(err); }
  }, [leadFilter, leadSearch, guard]);
  useEffect(() => { if (authed && tab === "leads") loadLeads(); }, [authed, tab, loadLeads]);

  const uploadLeads = async (text: string) => {
    const rows = parseLeadsText(text);
    if (!rows.length) { setUploadMsg("No phone numbers found — need columns like name, business, phone."); return; }
    try {
      const res = await api("leads", { method: "POST", body: JSON.stringify({ rows }) });
      setUploadMsg(`✓ ${res.added} added · ${res.updated} already existed (history kept) · ${res.skipped} skipped`);
      setPasteText("");
      loadLeads(); loadQueue();
    } catch (err) { guard(err); }
  };
  const patchLead = async (id: number, patch: any) => {
    try { await api(`leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); loadLeads(); }
    catch (err) { guard(err); }
  };

  // ── texts ──
  const [threads, setThreads] = useState<any[]>([]);
  const [openPhone, setOpenPhone] = useState("");
  const [openLead, setOpenLead] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [composer, setComposer] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const unread = threads.reduce((n, t) => n + (t.unread || 0), 0);

  const loadThreads = useCallback(async () => {
    try { setThreads((await api("sms")).threads || []); } catch (err) { guard(err); }
  }, [guard]);
  useEffect(() => { if (authed) { loadThreads(); const iv = setInterval(loadThreads, 15000); return () => clearInterval(iv); } }, [authed, loadThreads]);

  const openThread = useCallback(async (phone: string, lead?: any) => {
    setOpenPhone(phone);
    setOpenLead(lead || null);
    try { setMessages((await api(`sms/thread?phone=${encodeURIComponent(phone)}`)).messages || []); }
    catch (err) { guard(err); }
  }, [guard]);
  useEffect(() => {
    if (!(authed && tab === "texts" && openPhone)) return;
    const iv = setInterval(() => {
      api(`sms/thread?phone=${encodeURIComponent(openPhone)}`).then((d) => setMessages(d.messages || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, [authed, tab, openPhone]);

  const sendSms = async () => {
    const to = openPhone || newPhone;
    if (!to || !composer.trim()) return;
    try {
      await api("sms", { method: "POST", body: JSON.stringify({ phone: to, body: composer.trim() }) });
      setComposer("");
      loadThreads();
      openThread(to, openLead);
    } catch (err) { guard(err); }
  };

  // ── calls ──
  const [callLog, setCallLog] = useState<any[]>([]);
  useEffect(() => {
    if (!(authed && tab === "calls")) return;
    api("recordings").then((d) => setCallLog(d.calls || [])).catch(guard);
  }, [authed, tab, guard]);

  // ── numbers ──
  const [numbers, setNumbers] = useState<any[]>([]);
  const [areaCode, setAreaCode] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [numBusy, setNumBusy] = useState(false);
  const loadNumbers = useCallback(async () => {
    try { setNumbers((await api("numbers")).numbers || []); } catch (err) { guard(err); }
  }, [guard]);
  useEffect(() => { if (authed && tab === "numbers") loadNumbers(); }, [authed, tab, loadNumbers]);

  const lookupNumber = async () => {
    setNumBusy(true); setPreview(null);
    try { setPreview(await api("numbers", { method: "POST", body: JSON.stringify({ areaCode }) })); }
    catch (err) { guard(err); } finally { setNumBusy(false); }
  };
  const buyNumber = async () => {
    if (!preview?.phone) return;
    setNumBusy(true);
    try {
      const res = await api("numbers", { method: "POST", body: JSON.stringify({ areaCode, phone: preview.phone, confirm: true }) });
      notify(`✓ ${fmtPhone(res.phone)} is yours — now calling ${res.areaCode} leads from it`);
      setPreview(null); setAreaCode(""); loadNumbers();
    } catch (err) { guard(err); } finally { setNumBusy(false); }
  };
  const releaseNumber = async (id: number, phone: string) => {
    if (!confirm(`Release ${fmtPhone(phone)}? Its $1.15/mo charge stops and the number is gone for good.`)) return;
    try { await api("numbers", { method: "DELETE", body: JSON.stringify({ id }) }); notify("Number released"); loadNumbers(); }
    catch (err) { guard(err); }
  };

  // ── render ──
  if (authed === null) {
    return <div className="dlr" style={{ display: "grid", placeItems: "center" }}><p className="dlr-eyebrow">Loading</p></div>;
  }

  if (!authed) {
    return (
      <div className="dlr" style={{ display: "grid", placeItems: "center", padding: 20 }}>
        <form onSubmit={(e) => { e.preventDefault(); login(); }} className="dlr-panel dlr-panel-p" style={{ width: "100%", maxWidth: 380 }}>
          <p className="dlr-eyebrow">Montivaro</p>
          <h1 className="dlr-display" style={{ fontSize: 26, marginTop: 8, marginBottom: 18 }}>Command</h1>
          <label className="dlr-label" htmlFor="dlr-pw">Password</label>
          <input id="dlr-pw" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="dlr-input" style={{ marginTop: 6 }} />
          {loginError && <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--danger)" }} role="alert">{loginError}</p>}
          <button type="submit" className="dlr-btn primary big" style={{ marginTop: 16 }}>Enter</button>
        </form>
      </div>
    );
  }

  const w = session.winnerCall;
  const connected = w?.status === "in-progress";
  const ringing = session.waveActive && !w;

  return (
    <div className="dlr">
      {toast && <div className="dlr-toast">{toast}</div>}
      <div className="dlr-shell">
        <header className="dlr-top">
          <div>
            <p className="dlr-eyebrow">Montivaro</p>
            <h1 className="dlr-display" style={{ fontSize: 20, marginTop: 2 }}>Command</h1>
          </div>
          <nav className="dlr-tabs">
            {(["dial", "leads", "texts", "calls", "numbers"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`dlr-tab${tab === t ? " active" : ""}`}>
                {t}
                {t === "texts" && unread > 0 && <span className="badge">{unread}</span>}
              </button>
            ))}
          </nav>
        </header>

        {/* ══ DIAL ══ */}
        {tab === "dial" && (
          <div className="dlr-grid main">
            <section className="dlr-panel dlr-panel-p">
              {!session.active ? (
                <>
                  <h2 className="dlr-h dlr-display">Start dialing</h2>
                  <p className="dlr-sub">
                    The dialer rings <b style={{ color: "var(--paper)" }}>your phone</b> first. Answer it, stay on the line,
                    and leads start connecting automatically.
                  </p>

                  <div style={{ marginTop: 18 }}>
                    <label className="dlr-label" htmlFor="dlr-cell">Your phone</label>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <input id="dlr-cell" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="(404) 555-0123" className="dlr-input" />
                      <button onClick={async () => { try { await api("settings", { method: "POST", body: JSON.stringify({ agentPhone }) }); notify("Saved"); } catch (err) { guard(err); } }} className="dlr-btn">Save</button>
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <label className="dlr-label">Lines per wave</label>
                    <p className="dlr-sub" style={{ marginTop: 2 }}>
                      {lines === 1
                        ? "One at a time — safest, best for small lists."
                        : `Dials ${lines} at once; you talk to whoever answers first. The others get a short apology and go back in the queue.`}
                    </p>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {[1, 2, 3].map((n) => (
                        <button key={n} onClick={async () => { setLines(n); try { await api("settings", { method: "POST", body: JSON.stringify({ lines: n }) }); } catch (err) { guard(err); } }} className={`dlr-chip${lines === n ? " on" : ""}`}>
                          {n} {n === 1 ? "line" : "lines"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={startSession} disabled={busy || !agentPhone} className="dlr-btn go big" style={{ marginTop: 20 }}>
                    ▶ Start session — call my phone
                  </button>

                  <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
                    <label className="dlr-label" htmlFor="dlr-vm">Voicemail drop script</label>
                    <textarea id="dlr-vm" value={vmScript} onChange={(e) => setVmScript(e.target.value)} rows={3} className="dlr-textarea" style={{ marginTop: 6 }} />
                    <button onClick={async () => { try { await api("settings", { method: "POST", body: JSON.stringify({ vmScript }) }); notify("Script saved"); } catch (err) { guard(err); } }} className="dlr-btn" style={{ marginTop: 8 }}>Save script</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h2 className="dlr-h dlr-display" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="dlr-dot" />
                      {session.agentAnswered ? "Session live" : "Ringing your phone…"}
                    </h2>
                    <button onClick={stopSession} disabled={busy} className="dlr-btn danger">End</button>
                  </div>

                  {!session.agentAnswered && (
                    <p className="dlr-sub" style={{ marginTop: 14 }}>Pick up — dialing begins the moment you answer.</p>
                  )}

                  {session.agentAnswered && (pending || ringing || dialing) ? (
                    <div className="dlr-live" style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <p className="dlr-eyebrow" style={{ color: connected ? "var(--live)" : "var(--smoke)" }}>
                          {connected ? "Connected" : pending ? "Call ended — mark it" : `Dialing ${session.waveLeads?.length || lines}…`}
                        </p>
                        {(ringing || dialing) && <Wave />}
                      </div>

                      {pending ? (
                        <>
                          <p className="dlr-display" style={{ fontSize: 23, marginTop: 10 }}>{pending.name || "Unknown"}</p>
                          <p className="dlr-sub">{pending.business || "—"}</p>
                          <p className="dlr-mono" style={{ fontSize: 13, color: "var(--smoke)", marginTop: 3 }}>{fmtPhone(pending.phone)}</p>
                          {w?.amd && (
                            <p style={{ marginTop: 10, fontSize: 12.5, color: w.amd === "human" ? "var(--live)" : "var(--violet)" }}>
                              {w.amd === "human" ? "👤 Human answered" : `🤖 Machine detected (${w.amd})`}
                            </p>
                          )}
                          {connected && (
                            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                              <button onClick={() => callAction("vmdrop")} className="dlr-btn violet">📼 Drop voicemail</button>
                              <button onClick={() => callAction("hangup")} className="dlr-btn danger">Hang up</button>
                            </div>
                          )}

                          <p className="dlr-label" style={{ marginTop: 20, marginBottom: 8 }}>Mark this lead</p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                            {DISPOSITIONS.map((d) => (
                              <button key={d} onClick={() => mark(d)} className="dlr-btn" style={{ borderColor: `${STATUS_META[d].color}55`, color: STATUS_META[d].color, padding: "9px 13px" }}>
                                {STATUS_META[d].label}
                              </button>
                            ))}
                          </div>

                          {templates.length > 0 && (
                            <>
                              <p className="dlr-label" style={{ marginTop: 20, marginBottom: 8 }}>Send a text to {pending.name || "this lead"}</p>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                                {templates.map((t, i) => (
                                  <button key={i} onClick={() => mark("interested", t)} className="dlr-btn" style={{ borderColor: "rgba(52,211,153,0.45)", color: "var(--live)", padding: "9px 13px" }}>
                                    ✓ Interested + text {i + 1}
                                  </button>
                                ))}
                                {templates.map((t, i) => (
                                  <button key={`only-${i}`} onClick={() => quickText(t)} className="dlr-btn" style={{ padding: "9px 13px" }}>
                                    💬 Text {i + 1} only
                                  </button>
                                ))}
                              </div>
                              <p className="dlr-sub" style={{ marginTop: 8, fontSize: 11.5 }}>
                                Templates fill in their name and business. Edit them in the Texts tab.
                              </p>
                            </>
                          )}
                        </>
                      ) : (
                        <div style={{ marginTop: 12 }}>
                          {(session.waveLeads || []).map((l: any) => (
                            <p key={l.callSid} className="dlr-mono" style={{ fontSize: 12, color: "var(--smoke)", marginTop: 4 }}>
                              {fmtPhone(l.phone)} · {l.status}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : session.agentAnswered ? (
                    <div style={{ marginTop: 16 }}>
                      <button onClick={() => fireWave()} disabled={dialing || !queue.length} className="dlr-btn primary big">
                        {queue.length ? `📞 Dial next ${lines > 1 ? `${lines} leads` : ""}` : "Queue empty — add leads"}
                      </button>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 18, display: "grid", gap: 9 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--smoke)" }}>
                      <input type="checkbox" checked={autoDial} onChange={(e) => setAutoDial(e.target.checked)} />
                      Auto-dial the next lead
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--smoke)" }}>
                      <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} />
                      Hands-free — don&apos;t wait for me to mark (mark later in Calls)
                    </label>
                  </div>
                </>
              )}
            </section>

            <section className="dlr-panel dlr-panel-p">
              <h2 className="dlr-h dlr-display">Up next</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                <div className="dlr-stat"><p className="n dlr-mono">{counts.new || 0}</p><p className="k dlr-eyebrow">New</p></div>
                <div className="dlr-stat"><p className="n dlr-mono">{counts.callback || 0}</p><p className="k dlr-eyebrow">Callback</p></div>
                <div className="dlr-stat"><p className="n dlr-mono" style={{ color: "var(--live)" }}>{counts.interested || 0}</p><p className="k dlr-eyebrow">Interested</p></div>
              </div>
              <ul style={{ marginTop: 14, display: "grid", gap: 7 }}>
                {queue.slice(0, 9).map((l) => (
                  <li key={l.id} className="dlr-row">
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.name || l.business || fmtPhone(l.phone)}
                      </span>
                      <span className="dlr-mono" style={{ fontSize: 11, color: "var(--smoke-d)" }}>{fmtPhone(l.phone)}</span>
                    </span>
                    <StatusPill status={l.status} />
                  </li>
                ))}
                {!queue.length && <li className="dlr-sub">Nothing queued — add leads in the Leads tab.</li>}
              </ul>
            </section>
          </div>
        )}

        {/* ══ LEADS ══ */}
        {tab === "leads" && (
          <div style={{ display: "grid", gap: 18 }}>
            <section className="dlr-panel dlr-panel-p">
              <h2 className="dlr-h dlr-display">Add leads</h2>
              <p className="dlr-sub">
                Upload a CSV or paste rows — name, business, phone in any order, header optional. Re-uploading never
                wipes existing leads; they keep their marks, notes, and history.
              </p>
              <input type="file" accept=".csv,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (f) uploadLeads(await f.text()); e.target.value = ""; }} style={{ marginTop: 14, fontSize: 12.5, color: "var(--smoke)" }} />
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} placeholder={"Joe, Joe's Plumbing, (347) 613-1906\nMaria, Maria's Salon, 404-555-0123"} className="dlr-textarea dlr-mono" style={{ marginTop: 12, fontSize: 12.5 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={() => uploadLeads(pasteText)} disabled={!pasteText.trim()} className="dlr-btn primary">Add leads</button>
                {uploadMsg && <span className="dlr-sub" style={{ marginTop: 0 }}>{uploadMsg}</span>}
              </div>
            </section>

            <section className="dlr-panel dlr-panel-p">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadLeads()} placeholder="Search name, business, number…" className="dlr-input" style={{ maxWidth: 260 }} />
                <button onClick={() => setLeadFilter("")} className={`dlr-chip${!leadFilter ? " on" : ""}`}>All</button>
                {Object.entries(STATUS_META).map(([k, m]) => (
                  <button key={k} onClick={() => setLeadFilter(k)} className={`dlr-chip${leadFilter === k ? " on" : ""}`} style={leadFilter === k ? { background: m.color, borderColor: m.color, color: "#08080a" } : { color: m.color, borderColor: `${m.color}44` }}>
                    {m.label}{counts[k] ? ` · ${counts[k]}` : ""}
                  </button>
                ))}
              </div>
              <ul style={{ marginTop: 16, display: "grid", gap: 7 }}>
                {leads.map((l) => (
                  <li key={l.id} className="dlr-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>
                          {l.name || "—"} <span style={{ color: "var(--smoke-d)", fontWeight: 400 }}>· {l.business || "—"}</span>
                        </span>
                        <span className="dlr-mono" style={{ fontSize: 11.5, color: "var(--smoke-d)" }}>{fmtPhone(l.phone)}</span>
                      </span>
                      <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <select value={l.status} onChange={(e) => patchLead(l.id, { status: e.target.value })} className="dlr-select" style={{ width: "auto", padding: "7px 9px", fontSize: 12 }}>
                          {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                        </select>
                        <button onClick={() => { setTab("texts"); openThread(l.phone, l); }} className="dlr-btn" style={{ padding: "7px 11px" }}>💬</button>
                        <button onClick={() => { setExpandedLead(expandedLead === l.id ? null : l.id); setNoteDraft(l.notes || ""); }} className="dlr-btn" style={{ padding: "7px 11px" }}>📝</button>
                      </span>
                    </div>
                    {expandedLead === l.id && (
                      <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                        <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Notes…" className="dlr-input" />
                        <button onClick={() => { patchLead(l.id, { notes: noteDraft }); setExpandedLead(null); }} className="dlr-btn">Save</button>
                      </div>
                    )}
                    {l.notes && expandedLead !== l.id && <p className="dlr-sub" style={{ fontStyle: "italic", marginTop: 5 }}>“{l.notes}”</p>}
                  </li>
                ))}
                {!leads.length && <li className="dlr-sub">No leads yet.</li>}
              </ul>
            </section>
          </div>
        )}

        {/* ══ TEXTS ══ */}
        {tab === "texts" && (
          <div className="dlr-grid split">
            <section className="dlr-panel dlr-panel-p">
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="New text: phone…" className="dlr-input" />
                <button onClick={() => { const d = newPhone.replace(/\D/g, ""); if (d.length >= 10) { openThread(`+1${d.slice(-10)}`); setNewPhone(""); } }} className="dlr-btn">Open</button>
              </div>
              <ul className="dlr-scroll" style={{ marginTop: 12, display: "grid", gap: 6, maxHeight: 460 }}>
                {threads.map((t) => (
                  <li key={t.phone}>
                    <button onClick={() => openThread(t.phone, t)} className="dlr-row" style={{ width: "100%", textAlign: "left", cursor: "pointer", background: openPhone === t.phone ? "rgba(246,246,244,0.05)" : "transparent", borderColor: openPhone === t.phone ? "var(--line-2)" : "var(--line)" }}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.name || t.business || fmtPhone(t.phone)}
                          </span>
                          {t.unread > 0 && <span className="dlr-pill" style={{ background: "var(--live)", color: "#04160f", borderColor: "var(--live)" }}>{t.unread}</span>}
                        </span>
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--smoke-d)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.direction === "in" ? "↩ " : ""}{t.body}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {!threads.length && <li className="dlr-sub">No conversations yet.</li>}
              </ul>
            </section>

            <section className="dlr-panel dlr-panel-p" style={{ display: "flex", flexDirection: "column", minHeight: 480 }}>
              {openPhone ? (
                <>
                  <p style={{ paddingBottom: 10, borderBottom: "1px solid var(--line)", fontSize: 13.5, fontWeight: 600 }}>
                    {openLead?.name || openLead?.business ? `${openLead?.name || ""}${openLead?.business ? ` · ${openLead.business}` : ""} · ` : ""}
                    <span className="dlr-mono" style={{ color: "var(--smoke)" }}>{fmtPhone(openPhone)}</span>
                  </p>
                  <div className="dlr-scroll" style={{ flex: 1, display: "grid", gap: 7, alignContent: "start", padding: "14px 0" }}>
                    {messages.map((m) => (
                      <div key={m.id} className={`dlr-bubble ${m.direction === "out" ? "out" : "in"}`}>
                        {m.body}
                        <span style={{ display: "block", marginTop: 3, fontSize: 9.5, opacity: 0.55 }}>{timeAgo(m.created_at)}</span>
                      </div>
                    ))}
                    {!messages.length && <p className="dlr-sub">No messages yet.</p>}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 9 }}>
                    {templates.map((t, i) => (
                      <button key={i} onClick={() => setComposer(mergeTemplate(t, openLead || threads.find((th) => th.phone === openPhone)))} className="dlr-chip">Template {i + 1}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <textarea value={composer} onChange={(e) => setComposer(e.target.value)} rows={2} placeholder="Type a text…" className="dlr-textarea" style={{ resize: "none" }} />
                    <button onClick={sendSms} disabled={!composer.trim()} className="dlr-btn primary">Send</button>
                  </div>
                </>
              ) : (
                <p className="dlr-sub" style={{ margin: "auto" }}>Pick a conversation, or start a new text.</p>
              )}
            </section>
          </div>
        )}

        {/* ══ CALLS ══ */}
        {tab === "calls" && (
          <section className="dlr-panel dlr-panel-p">
            <h2 className="dlr-h dlr-display">Last 24 hours</h2>
            <p className="dlr-sub">Listen back to any call. Recordings delete themselves after 24 hours — the log line stays, the audio is gone for good.</p>
            <ul style={{ marginTop: 16, display: "grid", gap: 10 }}>
              {callLog.map((c) => (
                <li key={c.id} className="dlr-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name || c.business || fmtPhone(c.phone || "")}</span>
                      <span className="dlr-mono" style={{ marginLeft: 9, fontSize: 11.5, color: "var(--smoke-d)" }}>
                        {timeAgo(c.started_at)} · {c.duration_seconds ? mmss(c.duration_seconds) : "—"} · {c.status}
                        {c.amd ? ` · ${c.amd === "human" ? "human" : "machine"}` : ""}
                      </span>
                    </span>
                    {c.lead_status && <StatusPill status={c.lead_status} />}
                  </div>
                  {c.recording_sid && !c.recording_deleted ? (
                    <audio controls preload="none" style={{ width: "100%", marginTop: 9, height: 34 }} src={`/api/dialer/recordings/${c.recording_sid}`} />
                  ) : (
                    <p className="dlr-sub" style={{ marginTop: 5 }}>{c.recording_deleted ? "Recording expired (24h)" : "No recording"}</p>
                  )}
                </li>
              ))}
              {!callLog.length && <li className="dlr-sub">No calls in the last 24 hours.</li>}
            </ul>
          </section>
        )}

        {/* ══ NUMBERS ══ */}
        {tab === "numbers" && (
          <div style={{ display: "grid", gap: 18 }}>
            <section className="dlr-panel dlr-panel-p">
              <h2 className="dlr-h dlr-display">Local presence</h2>
              <p className="dlr-sub">
                Calls show a number from the lead&apos;s own area code — people answer local numbers far more often.
                Matching order: exact area code → same state → your main line. Callbacks forward to your phone and
                texts land in the Texts tab.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <input value={areaCode} onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Area code, e.g. 404" className="dlr-input dlr-mono" style={{ maxWidth: 190 }} />
                <button onClick={lookupNumber} disabled={numBusy || areaCode.length !== 3} className="dlr-btn">Find a number</button>
              </div>

              {preview && (
                <div className="dlr-live" style={{ marginTop: 14, borderColor: "var(--line-2)", background: "rgba(246,246,244,0.03)" }}>
                  <p className="dlr-eyebrow">Available</p>
                  <p className="dlr-display dlr-mono" style={{ fontSize: 22, marginTop: 6 }}>{fmtPhone(preview.phone)}</p>
                  <p className="dlr-sub">{preview.state ? `${preview.state} · ` : ""}{preview.monthly}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button onClick={buyNumber} disabled={numBusy} className="dlr-btn go">Buy &amp; use for {preview.areaCode} leads</button>
                    <button onClick={() => setPreview(null)} className="dlr-btn">Cancel</button>
                  </div>
                </div>
              )}

              <ul style={{ marginTop: 18, display: "grid", gap: 7 }}>
                {numbers.map((n) => (
                  <li key={n.id} className="dlr-row">
                    <span>
                      <span className="dlr-mono" style={{ fontSize: 13.5, fontWeight: 600 }}>{fmtPhone(n.phone)}</span>
                      <span className="dlr-sub" style={{ marginTop: 1 }}>Area {n.area_code}{n.state ? ` · ${n.state}` : ""} · $1.15/mo</span>
                    </span>
                    <button onClick={() => releaseNumber(n.id, n.phone)} className="dlr-btn danger" style={{ padding: "7px 12px" }}>Release</button>
                  </li>
                ))}
                {!numbers.length && <li className="dlr-sub">No local numbers yet — all calls go out from your main line.</li>}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
