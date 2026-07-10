"use client";

// /dialer — password-protected power dialer ("your own Kixie").
// Phone-bridge architecture: a session calls YOUR cell once, then leads are
// dialed from the Twilio local number and bridged into your line one by one.

import { useCallback, useEffect, useRef, useState } from "react";

const INK = "#0b0b0c";
const PAPER = "#f7f6f3";
const SMOKE = "#8f8f96";
const LINE = "rgba(247,246,243,0.14)";

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "#8f8f96" },
  interested: { label: "Interested", color: "#4ade80" },
  callback: { label: "Callback", color: "#facc15" },
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
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p;
}

function timeAgo(ts: string): string {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// Minimal CSV parser with quoted-field support + smart column detection.
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

  // Header detection
  let phoneCol = -1, nameCol = -1, bizCol = -1, start = 0;
  const header = rows[0].map((h) => h.toLowerCase());
  const headerHasPhoneWord = header.some((h) => /phone|number|cell|mobile|tel/.test(h));
  if (headerHasPhoneWord && !rows[0].some(looksPhone)) {
    start = 1;
    phoneCol = header.findIndex((h) => /phone|number|cell|mobile|tel/.test(h));
    nameCol = header.findIndex((h) => /name|contact|owner/.test(h) && !/business|company/.test(h));
    bizCol = header.findIndex((h) => /business|company|org|shop/.test(h));
  } else {
    // No header: pick the column with the most phone-like values.
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

const inputCls =
  "w-full rounded-lg border px-3 py-2.5 text-[14px] outline-none bg-transparent focus:border-white/40";
const btnCls =
  "rounded-lg px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.14em] transition disabled:opacity-40";

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] || STATUS_META.new;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ color: meta.color, border: `1px solid ${meta.color}44`, background: `${meta.color}14` }}
    >
      {meta.label}
    </span>
  );
}

export default function DialerApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<"dial" | "leads" | "texts" | "calls">("dial");
  const [toast, setToast] = useState("");

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  const guard = useCallback(
    (err: any) => {
      if (err?.message === "__auth__") setAuthed(false);
      else notify(err?.message || "Something went wrong");
    },
    [notify]
  );

  // ── settings ──
  const [agentPhone, setAgentPhone] = useState("");
  const [vmScript, setVmScript] = useState("");
  const [templates, setTemplates] = useState<string[]>([]);
  const loadSettings = useCallback(async () => {
    const s = await api("settings");
    setAgentPhone(s.agentPhone || "");
    setVmScript(s.vmScript || "");
    setTemplates(s.templates || []);
    return s;
  }, []);

  useEffect(() => {
    loadSettings()
      .then(() => setAuthed(true))
      .catch((err) => {
        if (err?.message === "__auth__") setAuthed(false);
        else setAuthed(false);
      });
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

  // ── session / dial tab ──
  const [session, setSession] = useState<any>({ active: false });
  const [queue, setQueue] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [autoDial, setAutoDial] = useState(true);
  const [awaiting, setAwaiting] = useState<any>(null); // lead needing a disposition
  const [busy, setBusy] = useState(false);
  const autoDialRef = useRef(autoDial);
  autoDialRef.current = autoDial;
  const awaitingRef = useRef(awaiting);
  awaitingRef.current = awaiting;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const loadQueue = useCallback(async () => {
    try {
      const data = await api("leads?queue=1&limit=15");
      setQueue(data.leads || []);
      const c: Record<string, number> = {};
      (data.counts || []).forEach((row: any) => (c[row.status] = row.n));
      setCounts(c);
    } catch (err) {
      guard(err);
    }
  }, [guard]);

  useEffect(() => {
    if (authed) loadQueue();
  }, [authed, loadQueue]);

  // Poll session state while authed.
  useEffect(() => {
    if (!authed) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api("session");
        if (stop) return;
        setSession(s);
        if (s.currentLead) setAwaiting(s.currentLead);
      } catch (err: any) {
        if (err?.message === "__auth__") setAuthed(false);
      }
    };
    tick();
    const iv = setInterval(tick, 1500);
    return () => { stop = true; clearInterval(iv); };
  }, [authed]);

  const dialLead = useCallback(
    async (leadId: number) => {
      setBusy(true);
      try {
        await api("dial", { method: "POST", body: JSON.stringify({ leadId }) });
      } catch (err) {
        guard(err);
      } finally {
        setBusy(false);
      }
    },
    [guard]
  );

  const dialNext = useCallback(async () => {
    const data = await api("leads?queue=1&limit=1").catch(() => null);
    const next = data?.leads?.[0];
    if (!next) {
      notify("Queue is empty 🎉");
      return;
    }
    await dialLead(next.id);
    loadQueue();
  }, [dialLead, loadQueue, notify]);

  const disposition = async (status: string) => {
    if (!awaiting) return;
    try {
      await api(`leads/${awaiting.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setAwaiting(null);
      loadQueue();
      const callOver = !sessionRef.current?.currentCall;
      if (callOver && autoDialRef.current && sessionRef.current?.active) {
        setTimeout(() => dialNext(), 600);
      }
    } catch (err) {
      guard(err);
    }
  };

  const startSession = async () => {
    setBusy(true);
    try {
      await api("session", { method: "POST", body: JSON.stringify({ action: "start" }) });
      notify("📞 Answer your phone — the dialer is calling you now");
    } catch (err) {
      guard(err);
    } finally {
      setBusy(false);
    }
  };
  const stopSession = async () => {
    setBusy(true);
    try {
      await api("session", { method: "POST", body: JSON.stringify({ action: "stop" }) });
      setAwaiting(null);
      setSession({ active: false });
    } catch (err) {
      guard(err);
    } finally {
      setBusy(false);
    }
  };
  const callAction = async (action: "vmdrop" | "hangup") => {
    try {
      await api("call-action", { method: "POST", body: JSON.stringify({ action }) });
      if (action === "vmdrop") notify("Voicemail dropping — mark the lead and keep rolling");
    } catch (err) {
      guard(err);
    }
  };

  // ── leads tab ──
  const [leads, setLeads] = useState<any[]>([]);
  const [leadFilter, setLeadFilter] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const [expandedLead, setExpandedLead] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const loadLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (leadFilter) params.set("status", leadFilter);
      if (leadSearch.trim()) params.set("search", leadSearch.trim());
      const data = await api(`leads?${params}`);
      setLeads(data.leads || []);
      const c: Record<string, number> = {};
      (data.counts || []).forEach((row: any) => (c[row.status] = row.n));
      setCounts(c);
    } catch (err) {
      guard(err);
    }
  }, [leadFilter, leadSearch, guard]);

  useEffect(() => {
    if (authed && tab === "leads") loadLeads();
  }, [authed, tab, loadLeads]);

  const uploadLeads = async (text: string) => {
    const rows = parseLeadsText(text);
    if (!rows.length) {
      setUploadMsg("No phone numbers found — need columns like name, business, phone.");
      return;
    }
    try {
      const res = await api("leads", { method: "POST", body: JSON.stringify({ rows }) });
      setUploadMsg(`✓ ${res.added} added, ${res.updated} already existed (kept their history), ${res.skipped} skipped`);
      setPasteText("");
      loadLeads();
      loadQueue();
    } catch (err) {
      guard(err);
    }
  };

  const patchLead = async (id: number, patch: any) => {
    try {
      await api(`leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      loadLeads();
    } catch (err) {
      guard(err);
    }
  };

  // ── texts tab ──
  const [threads, setThreads] = useState<any[]>([]);
  const [openPhone, setOpenPhone] = useState<string>("");
  const [openLead, setOpenLead] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [composer, setComposer] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const loadThreads = useCallback(async () => {
    try {
      const data = await api("sms");
      setThreads(data.threads || []);
    } catch (err) {
      guard(err);
    }
  }, [guard]);

  const openThread = useCallback(
    async (phone: string, lead?: any) => {
      setOpenPhone(phone);
      setOpenLead(lead || null);
      try {
        const data = await api(`sms/thread?phone=${encodeURIComponent(phone)}`);
        setMessages(data.messages || []);
      } catch (err) {
        guard(err);
      }
    },
    [guard]
  );

  useEffect(() => {
    if (!(authed && tab === "texts")) return;
    loadThreads();
    const iv = setInterval(() => {
      loadThreads();
      if (openPhone) {
        api(`sms/thread?phone=${encodeURIComponent(openPhone)}`)
          .then((d) => setMessages(d.messages || []))
          .catch(() => {});
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [authed, tab, openPhone, loadThreads]);

  const sendSms = async () => {
    const to = openPhone || newPhone;
    if (!to || !composer.trim()) return;
    try {
      await api("sms", { method: "POST", body: JSON.stringify({ phone: to, body: composer.trim() }) });
      setComposer("");
      if (!openPhone) setOpenPhone(to.startsWith("+") ? to : `+1${to.replace(/\D/g, "").slice(-10)}`);
      loadThreads();
      openThread(to, openLead);
    } catch (err) {
      guard(err);
    }
  };

  const fillTemplate = (t: string) => {
    const lead = openLead || threads.find((th) => th.phone === openPhone);
    setComposer(
      t
        .replace(/\{\{\s*name\s*\}\}/gi, lead?.name || "there")
        .replace(/\{\{\s*business\s*\}\}/gi, lead?.business || "your business")
    );
  };

  // ── calls tab ──
  const [callLog, setCallLog] = useState<any[]>([]);
  useEffect(() => {
    if (!(authed && tab === "calls")) return;
    api("recordings")
      .then((d) => setCallLog(d.calls || []))
      .catch(guard);
  }, [authed, tab, guard]);

  // ── render ──
  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: INK, color: SMOKE }}>
        Loading…
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5" style={{ background: INK, color: PAPER }}>
        <form
          onSubmit={(e) => { e.preventDefault(); login(); }}
          className="w-full max-w-sm rounded-2xl border p-7"
          style={{ borderColor: LINE, background: "rgba(247,246,243,0.03)" }}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: SMOKE }}>
            Montivaro
          </p>
          <h1 className="mb-5 text-xl font-bold">Dialer</h1>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={inputCls}
            style={{ borderColor: LINE, color: PAPER }}
          />
          {loginError && <p className="mt-3 text-[12px] text-red-400">{loginError}</p>}
          <button type="submit" className={`${btnCls} mt-4 w-full`} style={{ background: PAPER, color: INK }}>
            Open dialer
          </button>
        </form>
      </div>
    );
  }

  const liveCall = session.currentCall;
  const liveStatus = liveCall?.status || "";
  const amd = liveCall?.amd || "";
  const callEndedAwaiting = awaiting && !liveCall;

  return (
    <div className="min-h-screen pb-24" style={{ background: INK, color: PAPER }}>
      {/* header */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: SMOKE }}>
            Montivaro
          </p>
          <h1 className="text-lg font-bold">Power Dialer</h1>
        </div>
        <div className="flex gap-1 rounded-xl border p-1" style={{ borderColor: LINE }}>
          {(["dial", "leads", "texts", "calls"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-lg px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em]"
              style={tab === t ? { background: PAPER, color: INK } : { color: SMOKE }}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-[13px] font-semibold shadow-xl" style={{ background: PAPER, color: INK }}>
          {toast}
        </div>
      )}

      <main className="mx-auto max-w-5xl px-5 pt-6">
        {/* ── DIAL TAB ── */}
        {tab === "dial" && (
          <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
            <section className="rounded-2xl border p-6" style={{ borderColor: LINE, background: "rgba(247,246,243,0.03)" }}>
              {!session.active ? (
                <>
                  <h2 className="text-base font-bold">Start a dialing session</h2>
                  <p className="mt-1 text-[13px]" style={{ color: SMOKE }}>
                    The dialer calls <b style={{ color: PAPER }}>your phone</b> first — answer it and stay on the
                    line. Then every lead you dial gets connected straight into your call.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <input
                      value={agentPhone}
                      onChange={(e) => setAgentPhone(e.target.value)}
                      placeholder="Your cell, e.g. (404) 555-0123"
                      className={inputCls}
                      style={{ borderColor: LINE, color: PAPER }}
                    />
                    <button
                      onClick={async () => {
                        try {
                          await api("settings", { method: "POST", body: JSON.stringify({ agentPhone }) });
                          notify("Saved");
                        } catch (err) { guard(err); }
                      }}
                      className={btnCls}
                      style={{ border: `1px solid ${LINE}`, color: PAPER }}
                    >
                      Save
                    </button>
                  </div>
                  <button
                    onClick={startSession}
                    disabled={busy || !agentPhone}
                    className={`${btnCls} mt-4 w-full py-4 text-[13px]`}
                    style={{ background: "#4ade80", color: INK }}
                  >
                    ▶ Start session — call my phone
                  </button>
                  <div className="mt-6 border-t pt-4" style={{ borderColor: LINE }}>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: SMOKE }}>
                      Voicemail drop script
                    </p>
                    <textarea
                      value={vmScript}
                      onChange={(e) => setVmScript(e.target.value)}
                      rows={4}
                      className={`${inputCls} resize-y`}
                      style={{ borderColor: LINE, color: PAPER }}
                    />
                    <button
                      onClick={async () => {
                        try {
                          await api("settings", { method: "POST", body: JSON.stringify({ vmScript }) });
                          notify("Voicemail script saved");
                        } catch (err) { guard(err); }
                      }}
                      className={`${btnCls} mt-2`}
                      style={{ border: `1px solid ${LINE}`, color: PAPER }}
                    >
                      Save script
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-base font-bold">
                      <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                      Session live
                    </h2>
                    <button onClick={stopSession} disabled={busy} className={btnCls} style={{ border: "1px solid #f8717166", color: "#f87171" }}>
                      End session
                    </button>
                  </div>

                  {awaiting ? (
                    <div className="mt-4 rounded-xl border p-5" style={{ borderColor: LINE, background: "rgba(247,246,243,0.04)" }}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: SMOKE }}>
                        {liveCall ? (liveStatus === "in-progress" ? "🟢 Connected" : `Dialing… ${liveStatus}`) : "Call ended — mark it"}
                      </p>
                      <p className="mt-2 text-xl font-bold">{awaiting.name || "Unknown"}</p>
                      <p className="text-[14px]" style={{ color: SMOKE }}>
                        {awaiting.business || "—"} · {fmtPhone(awaiting.phone)}
                      </p>
                      {amd && (
                        <p className="mt-2 text-[12.5px]" style={{ color: amd === "human" ? "#4ade80" : "#a78bfa" }}>
                          {amd === "human" ? "👤 Human answered" : `🤖 Machine detected (${amd})`}
                        </p>
                      )}
                      {liveCall && (
                        <div className="mt-4 flex gap-2">
                          <button onClick={() => callAction("vmdrop")} className={btnCls} style={{ background: "#a78bfa", color: INK }}>
                            📼 Drop voicemail + next
                          </button>
                          <button onClick={() => callAction("hangup")} className={btnCls} style={{ border: "1px solid #f8717166", color: "#f87171" }}>
                            Hang up
                          </button>
                        </div>
                      )}
                      <p className="mt-5 mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: SMOKE }}>
                        Mark this lead
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {DISPOSITIONS.map((d) => (
                          <button
                            key={d}
                            onClick={() => disposition(d)}
                            className="rounded-lg px-3 py-2 text-[11.5px] font-bold"
                            style={{ border: `1px solid ${STATUS_META[d].color}55`, color: STATUS_META[d].color }}
                          >
                            {STATUS_META[d].label}
                          </button>
                        ))}
                      </div>
                      {callEndedAwaiting && (
                        <button onClick={() => { setAwaiting(null); if (autoDial) dialNext(); }} className="mt-3 text-[12px] underline" style={{ color: SMOKE }}>
                          Skip marking → next call
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4">
                      <button
                        onClick={dialNext}
                        disabled={busy || !queue.length}
                        className={`${btnCls} w-full py-4 text-[13px]`}
                        style={{ background: PAPER, color: INK }}
                      >
                        {queue.length ? `📞 Dial next — ${queue[0].name || queue[0].business || fmtPhone(queue[0].phone)}` : "Queue empty — upload more leads"}
                      </button>
                      <label className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: SMOKE }}>
                        <input type="checkbox" checked={autoDial} onChange={(e) => setAutoDial(e.target.checked)} />
                        Auto-dial the next lead after each call is marked
                      </label>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* queue preview */}
            <section className="rounded-2xl border p-6" style={{ borderColor: LINE, background: "rgba(247,246,243,0.03)" }}>
              <h2 className="text-base font-bold">Up next</h2>
              <p className="mt-0.5 text-[12px]" style={{ color: SMOKE }}>
                {counts.new || 0} new · {counts.callback || 0} callbacks · {counts.interested || 0} interested
              </p>
              <ul className="mt-3 space-y-2">
                {queue.slice(0, 10).map((l) => (
                  <li key={l.id} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: LINE }}>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold">{l.name || l.business || fmtPhone(l.phone)}</span>
                      <span className="block truncate text-[11.5px]" style={{ color: SMOKE }}>
                        {l.business ? `${l.business} · ` : ""}{fmtPhone(l.phone)}
                      </span>
                    </span>
                    <StatusPill status={l.status} />
                  </li>
                ))}
                {!queue.length && <li className="text-[13px]" style={{ color: SMOKE }}>Nothing queued — upload leads in the Leads tab.</li>}
              </ul>
            </section>
          </div>
        )}

        {/* ── LEADS TAB ── */}
        {tab === "leads" && (
          <div className="space-y-5">
            <section className="rounded-2xl border p-6" style={{ borderColor: LINE, background: "rgba(247,246,243,0.03)" }}>
              <h2 className="text-base font-bold">Add leads</h2>
              <p className="mt-0.5 text-[12.5px]" style={{ color: SMOKE }}>
                Upload a CSV or paste rows (name, business, phone — any order, header optional). Re-uploading
                never wipes existing leads; they keep their marks and history.
              </p>
              <div className="mt-3 flex flex-wrap items-start gap-3">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLeads(await f.text());
                    e.target.value = "";
                  }}
                  className="text-[13px]"
                  style={{ color: SMOKE }}
                />
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={4}
                placeholder={"Or paste here, e.g.\nJoe, Joe's Plumbing, (347) 613-1906\nMaria, Maria's Salon, 404-555-0123"}
                className={`${inputCls} mt-3 resize-y font-mono text-[12.5px]`}
                style={{ borderColor: LINE, color: PAPER }}
              />
              <div className="mt-2 flex items-center gap-3">
                <button onClick={() => uploadLeads(pasteText)} disabled={!pasteText.trim()} className={btnCls} style={{ background: PAPER, color: INK }}>
                  Add pasted leads
                </button>
                {uploadMsg && <span className="text-[12.5px]" style={{ color: SMOKE }}>{uploadMsg}</span>}
              </div>
            </section>

            <section className="rounded-2xl border p-6" style={{ borderColor: LINE, background: "rgba(247,246,243,0.03)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadLeads()}
                  placeholder="Search name, business, number…"
                  className={`${inputCls} max-w-xs`}
                  style={{ borderColor: LINE, color: PAPER }}
                />
                <button onClick={() => setLeadFilter("")} className="rounded-full px-3 py-1 text-[11px] font-bold" style={!leadFilter ? { background: PAPER, color: INK } : { color: SMOKE, border: `1px solid ${LINE}` }}>
                  All
                </button>
                {Object.entries(STATUS_META).map(([k, meta]) => (
                  <button key={k} onClick={() => setLeadFilter(k)} className="rounded-full px-3 py-1 text-[11px] font-bold" style={leadFilter === k ? { background: meta.color, color: INK } : { color: meta.color, border: `1px solid ${meta.color}44` }}>
                    {meta.label} {counts[k] ? `· ${counts[k]}` : ""}
                  </button>
                ))}
              </div>
              <ul className="mt-4 space-y-2">
                {leads.map((l) => (
                  <li key={l.id} className="rounded-lg border px-3 py-2.5" style={{ borderColor: LINE }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold">
                          {l.name || "—"} <span style={{ color: SMOKE }}>· {l.business || "—"}</span>
                        </span>
                        <span className="text-[12px]" style={{ color: SMOKE }}>{fmtPhone(l.phone)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <select
                          value={l.status}
                          onChange={(e) => patchLead(l.id, { status: e.target.value })}
                          className="rounded-lg border bg-transparent px-2 py-1.5 text-[12px]"
                          style={{ borderColor: LINE, color: PAPER }}
                        >
                          {Object.entries(STATUS_META).map(([k, m]) => (
                            <option key={k} value={k} style={{ color: INK }}>{m.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => { setTab("texts"); openThread(l.phone, l); }}
                          className="rounded-lg border px-2.5 py-1.5 text-[12px]"
                          style={{ borderColor: LINE, color: PAPER }}
                        >
                          💬
                        </button>
                        <button
                          onClick={() => {
                            setExpandedLead(expandedLead === l.id ? null : l.id);
                            setNoteDraft(l.notes || "");
                          }}
                          className="rounded-lg border px-2.5 py-1.5 text-[12px]"
                          style={{ borderColor: LINE, color: SMOKE }}
                        >
                          📝
                        </button>
                      </span>
                    </div>
                    {expandedLead === l.id && (
                      <div className="mt-2 flex gap-2">
                        <input
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Notes…"
                          className={inputCls}
                          style={{ borderColor: LINE, color: PAPER }}
                        />
                        <button
                          onClick={() => { patchLead(l.id, { notes: noteDraft }); setExpandedLead(null); }}
                          className={btnCls}
                          style={{ border: `1px solid ${LINE}`, color: PAPER }}
                        >
                          Save
                        </button>
                      </div>
                    )}
                    {l.notes && expandedLead !== l.id && (
                      <p className="mt-1 text-[12px] italic" style={{ color: SMOKE }}>“{l.notes}”</p>
                    )}
                  </li>
                ))}
                {!leads.length && <li className="text-[13px]" style={{ color: SMOKE }}>No leads yet.</li>}
              </ul>
            </section>
          </div>
        )}

        {/* ── TEXTS TAB ── */}
        {tab === "texts" && (
          <div className="grid gap-5 md:grid-cols-[1fr_1.6fr]">
            <section className="rounded-2xl border p-4" style={{ borderColor: LINE, background: "rgba(247,246,243,0.03)" }}>
              <div className="flex gap-2">
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="New text: phone number…"
                  className={inputCls}
                  style={{ borderColor: LINE, color: PAPER }}
                />
                <button
                  onClick={() => { if (newPhone.replace(/\D/g, "").length >= 10) { openThread(`+1${newPhone.replace(/\D/g, "").slice(-10)}`); setNewPhone(""); } }}
                  className={btnCls}
                  style={{ border: `1px solid ${LINE}`, color: PAPER }}
                >
                  Open
                </button>
              </div>
              <ul className="mt-3 space-y-1.5">
                {threads.map((t) => (
                  <li key={t.phone}>
                    <button
                      onClick={() => openThread(t.phone, t)}
                      className="w-full rounded-lg border px-3 py-2.5 text-left"
                      style={{ borderColor: openPhone === t.phone ? PAPER : LINE, background: openPhone === t.phone ? "rgba(247,246,243,0.06)" : "transparent" }}
                    >
                      <span className="flex items-center justify-between">
                        <span className="truncate text-[13.5px] font-semibold">
                          {t.name || t.business || fmtPhone(t.phone)}
                        </span>
                        {t.unread > 0 && (
                          <span className="ml-2 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold" style={{ color: INK }}>
                            {t.unread}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[12px]" style={{ color: SMOKE }}>
                        {t.direction === "in" ? "↩ " : ""}{t.body}
                      </span>
                    </button>
                  </li>
                ))}
                {!threads.length && <li className="p-2 text-[13px]" style={{ color: SMOKE }}>No conversations yet.</li>}
              </ul>
            </section>

            <section className="flex min-h-[420px] flex-col rounded-2xl border p-4" style={{ borderColor: LINE, background: "rgba(247,246,243,0.03)" }}>
              {openPhone ? (
                <>
                  <p className="border-b pb-2 text-[13.5px] font-semibold" style={{ borderColor: LINE }}>
                    {openLead?.name || openLead?.business ? `${openLead?.name || ""} ${openLead?.business ? `· ${openLead.business}` : ""} · ` : ""}
                    {fmtPhone(openPhone)}
                  </p>
                  <div className="flex-1 space-y-2 overflow-y-auto py-3">
                    {messages.map((m) => (
                      <div key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-[13.5px] ${m.direction === "out" ? "ml-auto" : ""}`}
                        style={m.direction === "out" ? { background: PAPER, color: INK } : { background: "rgba(247,246,243,0.08)" }}>
                        {m.body}
                        <span className="mt-0.5 block text-[10px] opacity-60">{timeAgo(m.created_at)}</span>
                      </div>
                    ))}
                    {!messages.length && <p className="text-[13px]" style={{ color: SMOKE }}>No messages yet — say hi 👋</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {templates.map((t, i) => (
                      <button key={i} onClick={() => fillTemplate(t)} className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: LINE, color: SMOKE }}>
                        Template {i + 1}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <textarea
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      rows={2}
                      placeholder="Type a text…"
                      className={`${inputCls} resize-none`}
                      style={{ borderColor: LINE, color: PAPER }}
                    />
                    <button onClick={sendSms} disabled={!composer.trim()} className={btnCls} style={{ background: PAPER, color: INK }}>
                      Send
                    </button>
                  </div>
                </>
              ) : (
                <p className="m-auto text-[13px]" style={{ color: SMOKE }}>Pick a conversation or start a new text.</p>
              )}
            </section>
          </div>
        )}

        {/* ── CALLS TAB ── */}
        {tab === "calls" && (
          <section className="rounded-2xl border p-6" style={{ borderColor: LINE, background: "rgba(247,246,243,0.03)" }}>
            <h2 className="text-base font-bold">Last 24 hours</h2>
            <p className="mt-0.5 text-[12.5px]" style={{ color: SMOKE }}>
              Listen to how calls went. Recordings auto-delete after 24 hours — the log line stays, the audio is gone for good.
            </p>
            <ul className="mt-4 space-y-3">
              {callLog.map((c) => (
                <li key={c.id} className="rounded-lg border px-4 py-3" style={{ borderColor: LINE }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="text-[14px] font-semibold">{c.name || c.business || fmtPhone(c.phone || "")}</span>
                      <span className="ml-2 text-[12px]" style={{ color: SMOKE }}>
                        {timeAgo(c.started_at)} · {c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, "0")}` : "—"} · {c.status}
                        {c.amd ? ` · ${c.amd === "human" ? "👤 human" : "🤖 machine"}` : ""}
                      </span>
                    </span>
                    {c.lead_status && <StatusPill status={c.lead_status} />}
                  </div>
                  {c.recording_sid && !c.recording_deleted ? (
                    <audio controls preload="none" className="mt-2 w-full" src={`/api/dialer/recordings/${c.recording_sid}`} />
                  ) : (
                    <p className="mt-1 text-[12px]" style={{ color: SMOKE }}>
                      {c.recording_deleted ? "Recording expired (24h)" : "No recording"}
                    </p>
                  )}
                </li>
              ))}
              {!callLog.length && <li className="text-[13px]" style={{ color: SMOKE }}>No calls in the last 24 hours.</li>}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
