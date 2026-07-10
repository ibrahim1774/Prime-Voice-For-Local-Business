"use client";

// /dialer — "Command": password-protected power dialer.
//
// Phone-bridge architecture: a session calls the agent's cell once, then each
// wave dials 1-3 queued leads simultaneously from the local-presence pool.
// The first lead to answer is bridged in; losers get a polite message and are
// re-queued. Marking a call auto-fires the next wave.

import { useCallback, useEffect, useRef, useState } from "react";
import LeadImport from "./LeadImport";

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "#8a8a92" },
  interested: { label: "Interested", color: "#34d399" },
  demo_interested: { label: "Demo interested", color: "#2dd4bf" },
  text_interested: { label: "Text interested", color: "#60a5fa" },
  email_interested: { label: "Email interested", color: "#f0abfc" },
  demo: { label: "Demo set", color: "#22d3ee" },
  closed: { label: "Closed / Won", color: "#4ade80" },
  callback: { label: "Callback", color: "#fbbf24" },
  voicemail: { label: "Voicemail", color: "#a78bfa" },
  no_answer: { label: "No answer", color: "#94a3b8" },
  sms_sent: { label: "SMS sent", color: "#c4b5fd" },
  not_interested: { label: "Not interested", color: "#f87171" },
  wrong_number: { label: "Wrong number", color: "#fb923c" },
  dnc: { label: "DNC", color: "#ef4444" },
};
const DISPOSITIONS = [
  "interested",
  "demo_interested",
  "text_interested",
  "email_interested",
  "demo",
  "closed",
  "callback",
  "voicemail",
  "no_answer",
  "sms_sent",
  "not_interested",
  "wrong_number",
  "dnc",
];
// Segments you can deliberately re-dial (voicemails, no-answers, etc.).
const DIAL_SEGMENTS: { key: string; label: string }[] = [
  { key: "new", label: "New leads (+ due callbacks)" },
  { key: "voicemail", label: "Voicemails — retry" },
  { key: "no_answer", label: "No answers — retry" },
  { key: "sms_sent", label: "SMS sent — follow up" },
  { key: "callback", label: "Callbacks" },
  { key: "not_interested", label: "Not interested — retry" },
  { key: "interested", label: "Interested — follow up" },
  { key: "demo_interested", label: "Demo interested — follow up" },
  { key: "text_interested", label: "Text interested — follow up" },
  { key: "email_interested", label: "Email interested — follow up" },
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
  const [tab, setTab] = useState<"dial" | "leads" | "texts" | "calls">("dial");
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
  const [callerId, setCallerId] = useState("auto");
  const [dialSegment, setDialSegment] = useState("new");
  const [dialState, setDialState] = useState("");
  const [dialList, setDialList] = useState("");
  const [dialIndustry, setDialIndustry] = useState("");
  const [callMode, setCallMode] = useState<"phone" | "browser">("phone");
  const [twilioNumbers, setTwilioNumbers] = useState<any[]>([]);
  const [stateOptions, setStateOptions] = useState<{ state: string; n: number }[]>([]);
  const [listOptions, setListOptions] = useState<{ list_name: string; n: number }[]>([]);
  const [industryOptions, setIndustryOptions] = useState<{ industry: string; n: number }[]>([]);
  const saveCallMode = async (m: "phone" | "browser") => {
    setCallMode(m);
    try { await api("settings", { method: "POST", body: JSON.stringify({ callMode: m }) }); }
    catch (err) { guard(err); }
  };
  const loadSettings = useCallback(async () => {
    const s = await api("settings");
    setAgentPhone(s.agentPhone || "");
    setVmScript(s.vmScript || "");
    setTemplates(s.templates || []);
    setLines(s.lines || 1);
    setCallerId(s.callerId || "auto");
    setDialSegment(s.dialSegment || "new");
    setDialState(s.dialState || "");
    setDialList(s.dialList || "");
    setDialIndustry(s.dialIndustry || "");
    setCallMode(s.callMode === "browser" ? "browser" : "phone");
  }, []);
  const saveDialFilter = async (patch: { dialSegment?: string; dialState?: string; dialList?: string; dialIndustry?: string }) => {
    if (patch.dialSegment !== undefined) setDialSegment(patch.dialSegment);
    if (patch.dialState !== undefined) setDialState(patch.dialState);
    if (patch.dialList !== undefined) setDialList(patch.dialList);
    if (patch.dialIndustry !== undefined) setDialIndustry(patch.dialIndustry);
    try { await api("settings", { method: "POST", body: JSON.stringify(patch) }); loadQueue(); }
    catch (err) { guard(err); }
  };
  const loadTwilioNumbers = useCallback(async () => {
    try { setTwilioNumbers((await api("twilio-numbers")).numbers || []); } catch { /* non-fatal */ }
  }, []);
  useEffect(() => { if (authed) loadTwilioNumbers(); }, [authed, loadTwilioNumbers]);
  const saveCallerId = async (v: string) => {
    setCallerId(v);
    try { await api("settings", { method: "POST", body: JSON.stringify({ callerId: v }) }); notify("Caller ID saved"); }
    catch (err) { guard(err); }
  };
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
  const [selectedTemplate, setSelectedTemplate] = useState(0);
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
      if (data.states) setStateOptions(data.states);
      if (data.lists) setListOptions(data.lists);
      if (data.industries) setIndustryOptions(data.industries);
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

  // Browser calling: the Voice SDK device lives for the session's lifetime.
  const deviceRef = useRef<any>(null);
  const destroyDevice = () => {
    try { deviceRef.current?.destroy(); } catch {}
    deviceRef.current = null;
  };

  const startSession = async () => {
    setBusy(true);
    try {
      if (callMode === "browser") {
        const started = await api("session", { method: "POST", body: JSON.stringify({ action: "start", mode: "browser" }) });
        try {
          const { token } = await api("webrtc-token");
          const { Device } = await import("@twilio/voice-sdk");
          const device = new Device(token, { logLevel: "error" });
          deviceRef.current = device;
          device.on("error", (e: any) => notify(`Browser call: ${e?.message || "audio error"}`));
          device.on("tokenWillExpire", async () => {
            try { device.updateToken((await api("webrtc-token")).token); } catch {}
          });
          const conn = await device.connect({ params: { c: started.conference } });
          // If the audio leg dies (network drop, device error), end the
          // session server-side so auto-dial can't wave leads into dead air.
          conn.on("disconnect", () => {
            api("session", { method: "POST", body: JSON.stringify({ action: "stop" }) }).catch(() => {});
          });
          notify("🎧 Connected through your browser — dialing starts now");
        } catch (err: any) {
          // Mic denied / SDK failure: don't leave a half-open session behind.
          destroyDevice();
          await api("session", { method: "POST", body: JSON.stringify({ action: "stop" }) }).catch(() => {});
          throw new Error(
            /Permission|NotAllowed/i.test(String(err?.message || err))
              ? "Microphone access was blocked — allow the mic for this site and try again."
              : err?.message || "Could not start browser calling"
          );
        }
      } else {
        await api("session", { method: "POST", body: JSON.stringify({ action: "start", mode: "phone" }) });
        notify("📞 Answer your phone — dialing starts automatically");
      }
    } catch (err) { guard(err); } finally { setBusy(false); }
  };
  const stopSession = async () => {
    setBusy(true);
    try {
      destroyDevice();
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

  const [callNote, setCallNote] = useState("");
  // A note typed for one lead must never land on the next one (hands-free
  // advances pending automatically).
  const pendingId = pending?.id;
  useEffect(() => { setCallNote(""); }, [pendingId]);
  const mark = async (status: string, alsoText?: string) => {
    if (!pending) return;
    const lead = pending;
    try {
      const patch: any = { status };
      if (callNote.trim()) patch.append_note = callNote.trim();
      await api(`leads/${lead.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setCallNote("");
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

  // ── stats ──
  const [stats, setStats] = useState<any>(null);
  const [statsRange, setStatsRange] = useState<"today" | "7d" | "30d" | "all" | "custom">("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const loadStats = useCallback(async () => {
    try {
      const qs =
        statsRange === "custom" && customFrom && customTo
          ? `from=${customFrom}&to=${customTo}`
          : `range=${statsRange === "custom" ? "7d" : statsRange}`;
      setStats(await api(`stats?${qs}`));
    } catch { /* non-fatal */ }
  }, [statsRange, customFrom, customTo]);
  useEffect(() => { if (authed && tab === "dial") loadStats(); }, [authed, tab, loadStats]);

  // ── leads ──
  const [leads, setLeads] = useState<any[]>([]);
  const [leadFilter, setLeadFilter] = useState("");
  const [leadStateFilter, setLeadStateFilter] = useState("");
  const [leadListFilter, setLeadListFilter] = useState("");
  const [leadIndustryFilter, setLeadIndustryFilter] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const [expandedLead, setExpandedLead] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; business: string; notes: string; industry: string }>({ name: "", business: "", notes: "", industry: "" });

  const loadLeads = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (leadFilter) p.set("status", leadFilter);
      if (leadStateFilter) p.set("state", leadStateFilter);
      if (leadListFilter) p.set("list", leadListFilter);
      if (leadIndustryFilter) p.set("industry", leadIndustryFilter);
      if (leadSearch.trim()) p.set("search", leadSearch.trim());
      const data = await api(`leads?${p}`);
      setLeads(data.leads || []);
      const c: Record<string, number> = {};
      (data.counts || []).forEach((r: any) => (c[r.status] = r.n));
      setCounts(c);
      if (data.states) setStateOptions(data.states);
      if (data.lists) setListOptions(data.lists);
      if (data.industries) setIndustryOptions(data.industries);
    } catch (err) { guard(err); }
  }, [leadFilter, leadStateFilter, leadListFilter, leadIndustryFilter, leadSearch, guard]);
  const requeueSegment = async () => {
    if (!leadFilter || leadFilter === "new" || leadFilter === "dnc") { notify("Pick a status to reset to New"); return; }
    const label = STATUS_META[leadFilter]?.label || leadFilter;
    if (!confirm(`Reset all ${label}${leadStateFilter ? ` in ${leadStateFilter}` : ""}${leadListFilter ? ` from "${leadListFilter}"` : ""} back to New so they re-enter the dial queue?`)) return;
    try {
      const res = await api("requeue", { method: "POST", body: JSON.stringify({ status: leadFilter, state: leadStateFilter, list: leadListFilter, industry: leadIndustryFilter }) });
      notify(`${res.requeued} leads reset to New`);
      loadLeads(); loadQueue();
    } catch (err) { guard(err); }
  };
  const renameList = async () => {
    if (!leadListFilter) return;
    const to = prompt(`Rename list "${leadListFilter}" to:`, leadListFilter);
    if (!to?.trim() || to.trim() === leadListFilter) return;
    try {
      const res = await api("lists", { method: "PATCH", body: JSON.stringify({ from: leadListFilter, to: to.trim() }) });
      notify(`List renamed (${res.renamed} leads)`);
      setLeadListFilter(to.trim());
      loadLeads();
    } catch (err) { guard(err); }
  };
  const deleteList = async () => {
    if (!leadListFilter) return;
    if (!confirm(`Delete the entire "${leadListFilter}" list AND all its leads? This can't be undone.`)) return;
    try {
      const res = await api("lists", { method: "DELETE", body: JSON.stringify({ name: leadListFilter }) });
      notify(`Deleted ${res.deleted} leads`);
      setLeadListFilter("");
      loadLeads(); loadQueue();
    } catch (err) { guard(err); }
  };
  useEffect(() => { if (authed && tab === "leads") loadLeads(); }, [authed, tab, loadLeads]);

  const importRows = async (rows: { name: string; business: string; phone: string; industry?: string }[], listName = "") => {
    if (!rows.length) { setUploadMsg("No valid phone numbers to import."); return null; }
    try {
      const res = await api("leads", { method: "POST", body: JSON.stringify({ rows, listName }) });
      setUploadMsg(`✓ ${res.added} added · ${res.updated} already existed (history kept) · ${res.skipped} skipped`);
      loadLeads(); loadQueue();
      return res as { added: number; updated: number; skipped: number };
    } catch (err) { guard(err); return null; }
  };
  const uploadLeads = async (text: string) => {
    const rows = parseLeadsText(text);
    if (!rows.length) { setUploadMsg("No phone numbers found — need columns like name, business, phone."); return; }
    await importRows(rows, "Pasted leads");
    setPasteText("");
  };
  const patchLead = async (id: number, patch: any) => {
    try { await api(`leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); loadLeads(); }
    catch (err) { guard(err); }
  };
  const deleteLead = async (id: number, label: string) => {
    if (!confirm(`Delete ${label}? This removes the lead and its call history for good.`)) return;
    try { await api(`leads/${id}`, { method: "DELETE" }); notify("Lead deleted"); loadLeads(); loadQueue(); }
    catch (err) { guard(err); }
  };

  // ── texts ──
  const [threads, setThreads] = useState<any[]>([]);
  const [openPhone, setOpenPhone] = useState("");
  const [openLead, setOpenLead] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [composer, setComposer] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [editingTemplates, setEditingTemplates] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<string[]>([]);
  const [templateSaved, setTemplateSaved] = useState(false);
  const unread = threads.reduce((n, t) => n + (t.unread || 0), 0);

  const saveTemplates = async (next: string[]) => {
    const cleaned = next.map((t) => t.trim()).filter(Boolean).slice(0, 10);
    try {
      await api("settings", { method: "POST", body: JSON.stringify({ templates: cleaned }) });
      setTemplates(cleaned);
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 2000);
    } catch (err) { guard(err); }
  };

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


  // ── render ──
  if (authed === null) {
    return <div className="dlr" style={{ display: "grid", placeItems: "center" }}><p className="dlr-eyebrow">Loading</p></div>;
  }

  if (!authed) {
    return (
      <div className="dlr" style={{ display: "grid", placeItems: "center", padding: 20 }}>
        <form onSubmit={(e) => { e.preventDefault(); login(); }} className="dlr-panel dlr-panel-p" style={{ width: "100%", maxWidth: 380 }}>
          <p className="dlr-eyebrow">Montivaro</p>
          <h1 className="dlr-display" style={{ fontSize: 24, marginTop: 8, marginBottom: 18 }}>Command Dialing Center</h1>
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
            <h1 className="dlr-display" style={{ fontSize: 20, marginTop: 2 }}>Command Dialing Center</h1>
          </div>
          <nav className="dlr-tabs">
            {(["dial", "leads", "texts", "calls"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`dlr-tab${tab === t ? " active" : ""}`}>
                {t}
                {t === "texts" && unread > 0 && <span className="badge">{unread}</span>}
              </button>
            ))}
          </nav>
        </header>

        {/* ══ DIAL ══ */}
        {tab === "dial" && (
          <>
          <section className="dlr-panel dlr-panel-p" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 className="dlr-h dlr-display">Analytics</h2>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                {([["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All time"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setStatsRange(k)} className={`dlr-chip${statsRange === k ? " on" : ""}`}>{label}</button>
                ))}
                <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                  <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => { setCustomFrom(e.target.value); setStatsRange("custom"); }} className="dlr-select dlr-select-sm" style={{ padding: "6px 8px" }} />
                  <span className="dlr-sub" style={{ marginTop: 0 }}>→</span>
                  <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => { setCustomTo(e.target.value); setStatsRange("custom"); }} className="dlr-select dlr-select-sm" style={{ padding: "6px 8px" }} />
                </span>
              </div>
            </div>

            <div className="dlr-metrics" style={{ marginTop: 14 }}>
              {(() => {
                const s = stats || {};
                const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
                const cells = [
                  { k: "Dials made", n: s.dials || 0, sub: "calls placed", color: "var(--paper)" },
                  { k: "Connection rate", n: `${pct(s.connected || 0, s.dials || 0)}%`, sub: `${s.connected || 0} talked to`, color: "var(--live)" },
                  { k: "Avg call", n: s.avgTalkSeconds ? mmss(s.avgTalkSeconds) : "0:00", sub: `${Math.round((s.talkSeconds || 0) / 60)} min total`, color: "var(--paper)" },
                  { k: "Interested", n: s.interested || 0, sub: `${pct(s.interested || 0, s.totalLeads || 0)}% of leads`, color: "var(--live)" },
                  { k: "Demos set", n: s.demo || 0, sub: `${pct(s.demo || 0, s.interested || 0)}% of interested`, color: "#22d3ee" },
                  { k: "Closed / Won", n: s.closed || 0, sub: `${pct(s.closed || 0, s.demo || 0)}% of demos`, color: "#4ade80" },
                  { k: "Not interested", n: s.notInterested || 0, sub: `${pct(s.notInterested || 0, s.totalLeads || 0)}% of leads`, color: "var(--danger)" },
                  { k: "Texts sent", n: s.textsSent || 0, sub: "outbound SMS", color: "var(--paper)" },
                ];
                return cells.map((c) => (
                  <div key={c.k} className="dlr-stat">
                    <p className="n dlr-mono" style={{ color: c.color }}>{c.n}</p>
                    <p className="k" style={{ fontSize: 12, fontWeight: 600, color: "var(--paper)", marginTop: 4 }}>{c.k}</p>
                    <p className="dlr-sub" style={{ marginTop: 1, fontSize: 11 }}>{c.sub}</p>
                  </div>
                ));
              })()}
            </div>

            {/* per-day chart */}
            {(() => {
              const series: any[] = stats?.series || [];
              if (!series.length) return <p className="dlr-sub" style={{ marginTop: 14 }}>No calls in this range yet.</p>;
              const max = Math.max(1, ...series.map((d) => d.dials));
              return (
                <div style={{ marginTop: 18 }}>
                  <p className="dlr-label" style={{ marginBottom: 10 }}>Per day — dials &amp; connections</p>
                  <div className="dlr-chart">
                    {series.map((d) => {
                      const label = d.day.slice(5); // MM-DD
                      const connRate = d.dials ? Math.round((d.connected / d.dials) * 100) : 0;
                      return (
                        <div key={d.day} className="dlr-chart-col" title={`${d.day}\n${d.dials} dials · ${d.connected} connected (${connRate}%) · ${mmss(d.talkSeconds)} talk`}>
                          <div className="dlr-chart-bar" style={{ height: `${(d.dials / max) * 100}%` }}>
                            <div className="dlr-chart-fill" style={{ height: `${d.dials ? (d.connected / d.dials) * 100 : 0}%` }} />
                          </div>
                          <span className="dlr-chart-n dlr-mono">{d.dials}</span>
                          <span className="dlr-chart-x dlr-mono">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                    <span className="dlr-sub" style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(246,246,244,0.2)" }} /> Dials</span>
                    <span className="dlr-sub" style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--live)" }} /> Connected</span>
                  </div>
                </div>
              );
            })()}
          </section>
          <div className="dlr-grid main">
            <section className="dlr-panel dlr-panel-p">
              {!session.active ? (
                <>
                  <h2 className="dlr-h dlr-display">Start dialing</h2>
                  <p className="dlr-sub">
                    {callMode === "browser"
                      ? "Talk right through this tab — headphones + mic, no phone needed."
                      : <>The dialer rings <b style={{ color: "var(--paper)" }}>your phone</b> first. Answer it, stay on the line, and leads start connecting automatically.</>}
                  </p>

                  <div style={{ marginTop: 18 }}>
                    <label className="dlr-label">How you talk</label>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button onClick={() => saveCallMode("browser")} className={`dlr-chip${callMode === "browser" ? " on" : ""}`}>🎧 Web calling (this tab)</button>
                      <button onClick={() => saveCallMode("phone")} className={`dlr-chip${callMode === "phone" ? " on" : ""}`}>📞 Call my phone</button>
                    </div>
                  </div>

                  {callMode === "phone" && (
                    <div style={{ marginTop: 18 }}>
                      <label className="dlr-label" htmlFor="dlr-cell">Your phone (your headset)</label>
                      <p className="dlr-sub" style={{ marginTop: 2 }}>Where the dialer calls <b style={{ color: "var(--paper)" }}>you</b> so you can talk. Leads never see this number.</p>
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <input id="dlr-cell" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="(404) 555-0123" className="dlr-input" />
                        <button onClick={async () => { try { await api("settings", { method: "POST", body: JSON.stringify({ agentPhone }) }); notify("Saved"); } catch (err) { guard(err); } }} className="dlr-btn">Save</button>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 18 }}>
                    <label className="dlr-label" htmlFor="dlr-callerid">Call from (what leads see)</label>
                    <p className="dlr-sub" style={{ marginTop: 2 }}>The caller ID shown to the people you dial.</p>
                    <select id="dlr-callerid" value={callerId} onChange={(e) => saveCallerId(e.target.value)} className="dlr-select" style={{ marginTop: 6 }}>
                      <option value="auto">Auto — match each lead&apos;s area code</option>
                      {twilioNumbers.map((n) => (
                        <option key={n.phone} value={n.phone}>
                          {fmtPhone(n.phone)}{n.state ? ` — ${n.state}` : (n.friendly && n.friendly.replace(/\D/g, "") !== n.phone.replace(/\D/g, "")) ? ` — ${n.friendly}` : ""}
                        </option>
                      ))}
                    </select>
                    {!twilioNumbers.length && <p className="dlr-sub" style={{ marginTop: 6, fontSize: 11.5 }}>Loading your Twilio numbers…</p>}
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <label className="dlr-label" htmlFor="dlr-segment">Who to dial</label>
                    <p className="dlr-sub" style={{ marginTop: 2 }}>Pick the batch to call through. Re-dial voicemails or no-answers without waiting for the daily cooldown.</p>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <select id="dlr-segment" value={dialSegment} onChange={(e) => saveDialFilter({ dialSegment: e.target.value })} className="dlr-select dlr-select-sm">
                        {DIAL_SEGMENTS.map((s) => (
                          <option key={s.key} value={s.key}>{s.label}{counts[s.key] ? ` · ${counts[s.key]}` : ""}</option>
                        ))}
                      </select>
                      <select value={dialState} onChange={(e) => saveDialFilter({ dialState: e.target.value })} className="dlr-select dlr-select-sm" aria-label="Filter by state">
                        <option value="">All states</option>
                        {stateOptions.map((s) => (
                          <option key={s.state} value={s.state}>{s.state} · {s.n}</option>
                        ))}
                      </select>
                      <select value={dialList} onChange={(e) => saveDialFilter({ dialList: e.target.value })} className="dlr-select dlr-select-sm" aria-label="Filter by lead list">
                        <option value="">All lists</option>
                        {listOptions.map((l) => (
                          <option key={l.list_name} value={l.list_name}>{l.list_name} · {l.n}</option>
                        ))}
                      </select>
                      <select value={dialIndustry} onChange={(e) => saveDialFilter({ dialIndustry: e.target.value })} className="dlr-select dlr-select-sm" aria-label="Filter by industry">
                        <option value="">All industries</option>
                        {industryOptions.map((i) => (
                          <option key={i.industry} value={i.industry}>{i.industry} · {i.n}</option>
                        ))}
                      </select>
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

                  <button onClick={startSession} disabled={busy || (callMode === "phone" && !agentPhone)} className="dlr-btn go big" style={{ marginTop: 20 }}>
                    {callMode === "browser" ? "▶ Start session — talk in this tab" : "▶ Start session — call my phone"}
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
                      {session.agentAnswered ? "Session live" : callMode === "browser" ? "Connecting your browser…" : "Ringing your phone…"}
                    </h2>
                    <button onClick={stopSession} disabled={busy} className="dlr-btn danger">End</button>
                  </div>

                  {!session.agentAnswered && (
                    <p className="dlr-sub" style={{ marginTop: 14 }}>
                      {callMode === "browser" ? "Allow the microphone if asked — dialing starts as soon as audio connects." : "Pick up — dialing begins the moment you answer."}
                    </p>
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
                          <p className="dlr-name-lg" style={{ marginTop: 10 }}>{pending.name || "Unknown"}</p>
                          <p className="dlr-company-lg" style={{ marginTop: 2 }}>{pending.business || "—"}</p>
                          <p className="dlr-phone-lg" style={{ marginTop: 5 }}>{fmtPhone(pending.phone)}</p>
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

                          <p className="dlr-label" style={{ marginTop: 18, marginBottom: 6 }}>Call note</p>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              value={callNote}
                              onChange={(e) => setCallNote(e.target.value)}
                              placeholder="e.g. owner's name is Mike, call back after 3pm…"
                              className="dlr-input"
                            />
                            <button
                              onClick={async () => {
                                if (!callNote.trim() || !pending) return;
                                try {
                                  await api(`leads/${pending.id}`, { method: "PATCH", body: JSON.stringify({ append_note: callNote.trim() }) });
                                  setCallNote("");
                                  notify("Note saved");
                                } catch (err) { guard(err); }
                              }}
                              disabled={!callNote.trim()}
                              className="dlr-btn"
                              title="Save note now (also saves automatically when you mark)"
                            >
                              💾
                            </button>
                          </div>
                          <p className="dlr-sub" style={{ marginTop: 4, fontSize: 11 }}>Saves to the lead when you mark the call (date-stamped).</p>

                          <p className="dlr-label" style={{ marginTop: 18, marginBottom: 8 }}>Mark this lead</p>
                          <select
                            value=""
                            onChange={(e) => { if (e.target.value) mark(e.target.value); }}
                            className="dlr-select dlr-select-sm"
                            aria-label="Mark this lead"
                          >
                            <option value="" disabled>Choose a marking…</option>
                            {DISPOSITIONS.map((d) => (
                              <option key={d} value={d}>{STATUS_META[d].label}</option>
                            ))}
                          </select>

                          {templates.length > 0 && (
                            <>
                              <p className="dlr-label" style={{ marginTop: 18, marginBottom: 8 }}>Text {pending.name || "this lead"}</p>
                              <select
                                value={selectedTemplate}
                                onChange={(e) => setSelectedTemplate(Number(e.target.value))}
                                className="dlr-select dlr-select-sm"
                                aria-label="Choose a text template"
                              >
                                {templates.map((_, i) => (
                                  <option key={i} value={i}>Template {i + 1}</option>
                                ))}
                              </select>
                              <p className="dlr-sub" style={{ fontSize: 11.5, marginTop: 6 }}>
                                “{mergeTemplate(templates[selectedTemplate] || "", pending)}”
                              </p>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
                                <button onClick={() => mark("interested", templates[selectedTemplate])} className="dlr-btn" style={{ borderColor: "rgba(52,211,153,0.45)", color: "var(--live)" }}>
                                  ✓ Interested + send
                                </button>
                                <button onClick={() => quickText(templates[selectedTemplate])} className="dlr-btn">
                                  💬 Send only
                                </button>
                              </div>
                              <p className="dlr-sub" style={{ marginTop: 8, fontSize: 11.5 }}>
                                Templates fill in their name and business. Edit them in the Texts tab.
                              </p>
                            </>
                          )}
                        </>
                      ) : (
                        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                          {(session.waveLeads || []).length === 0 && (
                            <p className="dlr-sub" style={{ marginTop: 0 }}>Placing {lines > 1 ? `${lines} calls` : "the call"}…</p>
                          )}
                          {(session.waveLeads || []).map((l: any) => (
                            <div key={l.callSid} style={{ borderLeft: "2px solid rgba(52,211,153,0.5)", paddingLeft: 12 }}>
                              <p className="dlr-name" style={{ fontSize: 17 }}>{l.name || "Unknown"}</p>
                              {l.business && <p className="dlr-company" style={{ color: "var(--smoke)" }}>{l.business}</p>}
                              <p className="dlr-phone" style={{ marginTop: 2 }}>{fmtPhone(l.phone)}</p>
                              <p className="dlr-sub" style={{ marginTop: 2, fontSize: 11 }}>{l.status === "in-progress" ? "🟢 answered" : l.status === "ringing" ? "ringing…" : l.status || "dialing…"}</p>
                            </div>
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
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <h2 className="dlr-h dlr-display">Up next</h2>
                <span className="dlr-sub" style={{ marginTop: 0, fontSize: 11.5 }}>
                  {DIAL_SEGMENTS.find((s) => s.key === dialSegment)?.label || "New leads"}{dialState ? ` · ${dialState}` : ""}
                </span>
              </div>
              {session.active && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <select value={dialSegment} onChange={(e) => saveDialFilter({ dialSegment: e.target.value })} className="dlr-select dlr-select-sm" aria-label="Who to dial">
                    {DIAL_SEGMENTS.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}{counts[s.key] ? ` · ${counts[s.key]}` : ""}</option>
                    ))}
                  </select>
                  <select value={dialState} onChange={(e) => saveDialFilter({ dialState: e.target.value })} className="dlr-select dlr-select-sm" aria-label="State">
                    <option value="">All states</option>
                    {stateOptions.map((s) => <option key={s.state} value={s.state}>{s.state} · {s.n}</option>)}
                  </select>
                  <select value={dialList} onChange={(e) => saveDialFilter({ dialList: e.target.value })} className="dlr-select dlr-select-sm" aria-label="Lead list">
                    <option value="">All lists</option>
                    {listOptions.map((l) => <option key={l.list_name} value={l.list_name}>{l.list_name} · {l.n}</option>)}
                  </select>
                  <select value={dialIndustry} onChange={(e) => saveDialFilter({ dialIndustry: e.target.value })} className="dlr-select dlr-select-sm" aria-label="Industry">
                    <option value="">All industries</option>
                    {industryOptions.map((i) => <option key={i.industry} value={i.industry}>{i.industry} · {i.n}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                <div className="dlr-stat"><p className="n dlr-mono">{counts.new || 0}</p><p className="k dlr-eyebrow">New</p></div>
                <div className="dlr-stat"><p className="n dlr-mono" style={{ color: "#a78bfa" }}>{counts.voicemail || 0}</p><p className="k dlr-eyebrow">Voicemail</p></div>
                <div className="dlr-stat"><p className="n dlr-mono" style={{ color: "var(--live)" }}>{counts.interested || 0}</p><p className="k dlr-eyebrow">Interested</p></div>
              </div>
              <ul style={{ marginTop: 14, display: "grid", gap: 7 }}>
                {queue.slice(0, 9).map((l) => (
                  <li key={l.id} className="dlr-row">
                    <span style={{ minWidth: 0 }}>
                      <span className="dlr-name" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.name || l.business || fmtPhone(l.phone)}
                      </span>
                      {l.business && l.name && <span className="dlr-company" style={{ display: "block", color: "var(--smoke)" }}>{l.business}</span>}
                      <span className="dlr-phone" style={{ display: "block", marginTop: 1 }}>{fmtPhone(l.phone)}</span>
                    </span>
                    <StatusPill status={l.status} />
                  </li>
                ))}
                {!queue.length && <li className="dlr-sub">Nothing queued — add leads in the Leads tab.</li>}
              </ul>
            </section>
          </div>
          </>
        )}

        {/* ══ LEADS ══ */}
        {tab === "leads" && (
          <div style={{ display: "grid", gap: 18 }}>
            <section className="dlr-panel dlr-panel-p">
              <h2 className="dlr-h dlr-display">Import leads</h2>
              <p className="dlr-sub">
                Upload a CSV or Excel file and map your own columns — any export layout works. Re-importing never
                wipes existing leads; they keep their marks, notes, and history.
              </p>
              <div style={{ marginTop: 14 }}>
                <LeadImport onImport={importRows} onDone={() => { loadLeads(); loadQueue(); }} />
              </div>
              {uploadMsg && <p className="dlr-sub" style={{ marginTop: 12 }}>{uploadMsg}</p>}

              <details style={{ marginTop: 16 }}>
                <summary className="dlr-label" style={{ cursor: "pointer" }}>Or paste rows manually</summary>
                <p className="dlr-sub" style={{ marginTop: 8, fontSize: 11.5 }}>
                  One lead per line. A name and business are optional — <b style={{ color: "var(--paper)" }}>just phone numbers is fine</b>. Add a name/business after the number if you have them.
                </p>
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} placeholder={"(347) 613-1906\n404-555-0123, Maria, Maria's Salon\n212 555 0144"} className="dlr-textarea dlr-mono" style={{ marginTop: 8, fontSize: 12.5 }} />
                <button onClick={() => uploadLeads(pasteText)} disabled={!pasteText.trim()} className="dlr-btn primary" style={{ marginTop: 8 }}>Add pasted rows</button>
              </details>
            </section>

            <section className="dlr-panel dlr-panel-p">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                <span style={{ flex: 1, minWidth: 180 }}>
                  <label className="dlr-label" style={{ display: "block", marginBottom: 4 }}>Search</label>
                  <input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadLeads()} placeholder="Name, business, number…" className="dlr-input" />
                </span>
                <div>
                  <label className="dlr-label" htmlFor="dlr-filter" style={{ display: "block", marginBottom: 4 }}>Marking</label>
                  <select
                    id="dlr-filter"
                    value={leadFilter}
                    onChange={(e) => setLeadFilter(e.target.value)}
                    className="dlr-select dlr-select-sm"
                    style={{ borderColor: leadFilter ? `${STATUS_META[leadFilter]?.color}88` : undefined, color: leadFilter ? STATUS_META[leadFilter]?.color : undefined }}
                  >
                    <option value="">All leads{Object.values(counts).length ? ` · ${Object.values(counts).reduce((a, b) => a + b, 0)}` : ""}</option>
                    {Object.entries(STATUS_META).map(([k, m]) => (
                      <option key={k} value={k}>{m.label}{counts[k] ? ` · ${counts[k]}` : " · 0"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="dlr-label" htmlFor="dlr-statefilter" style={{ display: "block", marginBottom: 4 }}>State</label>
                  <select id="dlr-statefilter" value={leadStateFilter} onChange={(e) => setLeadStateFilter(e.target.value)} className="dlr-select dlr-select-sm">
                    <option value="">All states</option>
                    {stateOptions.map((s) => <option key={s.state} value={s.state}>{s.state} · {s.n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="dlr-label" htmlFor="dlr-listfilter" style={{ display: "block", marginBottom: 4 }}>Lead list</label>
                  <select id="dlr-listfilter" value={leadListFilter} onChange={(e) => setLeadListFilter(e.target.value)} className="dlr-select dlr-select-sm">
                    <option value="">All lists</option>
                    {listOptions.map((l) => <option key={l.list_name} value={l.list_name}>{l.list_name} · {l.n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="dlr-label" htmlFor="dlr-industryfilter" style={{ display: "block", marginBottom: 4 }}>Industry</label>
                  <select id="dlr-industryfilter" value={leadIndustryFilter} onChange={(e) => setLeadIndustryFilter(e.target.value)} className="dlr-select dlr-select-sm">
                    <option value="">All industries</option>
                    {industryOptions.map((i) => <option key={i.industry} value={i.industry}>{i.industry} · {i.n}</option>)}
                  </select>
                </div>
                {leadFilter && leadFilter !== "new" && leadFilter !== "dnc" && (
                  <button onClick={requeueSegment} className="dlr-btn" title="Reset this segment to New so they re-enter the dial queue" style={{ padding: "8px 12px" }}>↻ Reset to New</button>
                )}
                {leadListFilter && (
                  <span style={{ display: "flex", gap: 6 }}>
                    <button onClick={renameList} className="dlr-btn" style={{ padding: "8px 12px" }}>Rename list</button>
                    <button onClick={deleteList} className="dlr-btn danger" style={{ padding: "8px 12px" }}>Delete list</button>
                  </span>
                )}
              </div>
              <ul style={{ marginTop: 16, display: "grid", gap: 7 }}>
                {leads.map((l) => (
                  <li key={l.id} className="dlr-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block" }}>
                          <span className="dlr-name">{l.name || "—"}</span>
                          {l.business && <span className="dlr-company" style={{ color: "var(--smoke)" }}> · {l.business}</span>}
                        </span>
                        <span className="dlr-phone" style={{ display: "block", marginTop: 2 }}>{fmtPhone(l.phone)}</span>
                        {(l.industry || l.list_name || l.state) && (
                          <span className="dlr-sub" style={{ display: "block", marginTop: 2, fontSize: 11 }}>
                            {[l.industry, l.state, l.list_name].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <select value={l.status} onChange={(e) => patchLead(l.id, { status: e.target.value })} className="dlr-select" style={{ width: "auto", padding: "7px 9px", fontSize: 12 }}>
                          {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                        </select>
                        <button title="Text" onClick={() => { setTab("texts"); openThread(l.phone, l); }} className="dlr-btn" style={{ padding: "7px 11px" }}>💬</button>
                        <button title="Edit" onClick={() => { setExpandedLead(expandedLead === l.id ? null : l.id); setEditDraft({ name: l.name || "", business: l.business || "", notes: l.notes || "", industry: l.industry || "" }); }} className="dlr-btn" style={{ padding: "7px 11px" }}>✎</button>
                        <button title="Delete" onClick={() => deleteLead(l.id, l.name || l.business || fmtPhone(l.phone))} className="dlr-btn danger" style={{ padding: "7px 11px" }}>🗑</button>
                      </span>
                    </div>
                    {expandedLead === l.id ? (
                      <div style={{ marginTop: 10, display: "grid", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                          <span>
                            <label className="dlr-label" style={{ display: "block", marginBottom: 4 }}>Name</label>
                            <input value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} className="dlr-input" placeholder="Name" />
                          </span>
                          <span>
                            <label className="dlr-label" style={{ display: "block", marginBottom: 4 }}>Business</label>
                            <input value={editDraft.business} onChange={(e) => setEditDraft((d) => ({ ...d, business: e.target.value }))} className="dlr-input" placeholder="Business" />
                          </span>
                        </div>
                        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                          <span>
                            <label className="dlr-label" style={{ display: "block", marginBottom: 4 }}>Industry</label>
                            <input value={editDraft.industry} onChange={(e) => setEditDraft((d) => ({ ...d, industry: e.target.value }))} className="dlr-input" placeholder="e.g. Plumbing" />
                          </span>
                          <span>
                            <label className="dlr-label" style={{ display: "block", marginBottom: 4 }}>Notes</label>
                            <input value={editDraft.notes} onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))} className="dlr-input" placeholder="Notes…" />
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { patchLead(l.id, editDraft); setExpandedLead(null); }} className="dlr-btn primary">Save changes</button>
                          <button onClick={() => setExpandedLead(null)} className="dlr-btn">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      l.notes && <p className="dlr-sub" style={{ fontStyle: "italic", marginTop: 5, whiteSpace: "pre-wrap" }}>“{l.notes}”</p>
                    )}
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
                          <span className="dlr-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p className="dlr-label" style={{ margin: 0 }}>Text templates</p>
                  {!editingTemplates ? (
                    <button onClick={() => { setTemplateDraft(templates.length ? [...templates] : [""]); setEditingTemplates(true); }} className="dlr-btn" style={{ padding: "5px 10px", fontSize: 11 }}>Edit</button>
                  ) : (
                    <span style={{ display: "flex", gap: 6 }}>
                      {templateSaved && <span className="dlr-sub" style={{ marginTop: 0, color: "var(--live)" }}>Saved ✓</span>}
                      <button onClick={() => setEditingTemplates(false)} className="dlr-btn" style={{ padding: "5px 10px", fontSize: 11 }}>Done</button>
                    </span>
                  )}
                </div>

                {!editingTemplates ? (
                  <ul style={{ marginTop: 10, display: "grid", gap: 6 }}>
                    {templates.map((t, i) => (
                      <li key={i} className="dlr-row" style={{ fontSize: 12, overflow: "hidden" }}>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span className="dlr-label" style={{ display: "block", marginBottom: 2 }}>Template {i + 1}</span>
                          <span style={{ display: "block", color: "var(--smoke)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</span>
                        </span>
                      </li>
                    ))}
                    {!templates.length && <li className="dlr-sub">No templates yet — tap Edit to add one.</li>}
                  </ul>
                ) : (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <p className="dlr-sub" style={{ marginTop: 0, fontSize: 11.5 }}>
                      Use <span className="dlr-mono">{"{{name}}"}</span> and <span className="dlr-mono">{"{{business}}"}</span> — they fill in per lead when you send.
                    </p>
                    {templateDraft.map((t, i) => (
                      <div key={i} style={{ display: "grid", gap: 6 }}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span className="dlr-label" style={{ margin: 0 }}>Template {i + 1}</span>
                          <button onClick={() => setTemplateDraft((d) => d.filter((_, j) => j !== i))} className="dlr-btn danger" style={{ padding: "3px 9px", fontSize: 10.5 }}>Remove</button>
                        </span>
                        <textarea
                          value={t}
                          onChange={(e) => setTemplateDraft((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
                          rows={3}
                          className="dlr-textarea"
                          style={{ fontSize: 12.5 }}
                          placeholder="Hi {{name}}, this is Ibrahim from Montivaro…"
                        />
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {templateDraft.length < 10 && (
                        <button onClick={() => setTemplateDraft((d) => [...d, ""])} className="dlr-btn" style={{ padding: "7px 12px" }}>+ Add template</button>
                      )}
                      <button onClick={() => saveTemplates(templateDraft)} className="dlr-btn primary" style={{ padding: "7px 14px" }}>Save templates</button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="dlr-panel dlr-panel-p" style={{ display: "flex", flexDirection: "column", minHeight: 560, minWidth: 0 }}>
              {openPhone ? (
                <>
                  <div style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)", minWidth: 0 }}>
                    {(openLead?.name || openLead?.business) && (
                      <p className="dlr-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {openLead?.name || openLead?.business}
                        {openLead?.name && openLead?.business && <span className="dlr-company" style={{ color: "var(--smoke)" }}> · {openLead.business}</span>}
                      </p>
                    )}
                    <p className="dlr-phone" style={{ marginTop: 2 }}>{fmtPhone(openPhone)}</p>
                  </div>
                  <div className="dlr-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9, padding: "16px 2px", minHeight: 260 }}>
                    {messages.map((m) => (
                      <div key={m.id} className={`dlr-bubble ${m.direction === "out" ? "out" : "in"}`}>
                        <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</span>
                        <span style={{ display: "block", marginTop: 4, fontSize: 9.5, opacity: 0.55 }}>{m.direction === "out" ? "Sent" : "Received"} · {timeAgo(m.created_at)}</span>
                      </div>
                    ))}
                    {!messages.length && <p className="dlr-sub" style={{ margin: "auto" }}>No messages yet — say hi 👋</p>}
                  </div>
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    {templates.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 9 }}>
                        {templates.map((t, i) => (
                          <button key={i} onClick={() => setComposer(mergeTemplate(t, openLead || threads.find((th) => th.phone === openPhone)))} className="dlr-chip">Template {i + 1}</button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <textarea value={composer} onChange={(e) => setComposer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendSms(); } }} rows={2} placeholder="Type a text…  (⌘/Ctrl+Enter to send)" className="dlr-textarea" style={{ resize: "none", flex: 1, minWidth: 0 }} />
                      <button onClick={sendSms} disabled={!composer.trim()} className="dlr-btn primary" style={{ flexShrink: 0, alignSelf: "stretch" }}>Send</button>
                    </div>
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
                      <span className="dlr-name">{c.name || c.business || fmtPhone(c.phone || "")}</span>
                      {c.phone && (c.name || c.business) && <span className="dlr-phone" style={{ marginLeft: 8 }}>{fmtPhone(c.phone)}</span>}
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
      </div>
    </div>
  );
}
