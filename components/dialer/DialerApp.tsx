"use client";

// /dialer — "Command": password-protected power dialer.
//
// Phone-bridge architecture: a session calls the agent's cell once, then each
// wave dials 1-3 queued leads simultaneously from the local-presence pool.
// The first lead to answer is bridged in; losers get a polite message and are
// re-queued. Marking a call auto-fires the next wave.

import { useCallback, useEffect, useRef, useState } from "react";
import LeadImport from "./LeadImport";
import { Icon } from "./icons";

const TAB_LABELS = { dial: "Dial", leads: "Leads", texts: "Texts", calls: "Calls" } as const;
const LEAD_PAGE_SIZES = [25, 50, 100] as const;
type Tab = "dial" | "leads" | "catchall" | "primebarber" | "website" | "texts" | "calls";

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "#8a8a92" },
  interested: { label: "Interested", color: "#34d399" },
  demo_interested: { label: "Demo interested", color: "#2dd4bf" },
  text_interested: { label: "SMS interested", color: "#60a5fa" },
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
  "demo_interested",
  "text_interested",
  "email_interested",
  "callback",
  "voicemail",
  "no_answer",
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
  { key: "text_interested", label: "SMS interested — follow up" },
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
// "Jul 10 · 2:34 PM" — every message and thread carries its real date + time.
function fmtDateTime(ts: string): string {
  return new Date(ts)
    .toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
    .replace(",", " ·");
}
function localDay(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Which lead subpage a conversation belongs to: a demo-line call wins,
// otherwise being in the lead book makes it a dialer lead.
function threadSource(t: any): string {
  if (t.product === "primebarber") return "primebarber";
  if (t.product === "website") return "website";
  if (t.product) return "catchall"; // montivaro, dentist, contractors
  return t.lead_id ? "leads" : "other";
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
  const [tab, setTab] = useState<Tab>("dial");
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
  const [vmMode, setVmMode] = useState<"listen" | "skip" | "drop">("skip");
  const [redialAttempts, setRedialAttempts] = useState(1);
  const [redialGapHours, setRedialGapHours] = useState(2);
  const [dialShuffle, setDialShuffle] = useState(false);
  const [twilioNumbers, setTwilioNumbers] = useState<any[]>([]);
  const [stateOptions, setStateOptions] = useState<{ state: string; n: number }[]>([]);
  const [listOptions, setListOptions] = useState<{ list_name: string; n: number }[]>([]);
  const [industryOptions, setIndustryOptions] = useState<{ industry: string; n: number }[]>([]);
  const [unlistedCount, setUnlistedCount] = useState(0);
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
    setVmMode(["listen", "skip", "drop"].includes(s.vmMode) ? s.vmMode : "skip");
    setRedialAttempts(s.redialAttempts || 1);
    setRedialGapHours(s.redialGapHours || 2);
    setDialShuffle(Boolean(s.dialShuffle));
  }, []);
  const saveRetry = async (patch: { redialAttempts?: number; redialGapHours?: number; dialShuffle?: boolean }) => {
    if (patch.redialAttempts !== undefined) setRedialAttempts(patch.redialAttempts);
    if (patch.redialGapHours !== undefined) setRedialGapHours(patch.redialGapHours);
    if (patch.dialShuffle !== undefined) setDialShuffle(patch.dialShuffle);
    try { await api("settings", { method: "POST", body: JSON.stringify(patch) }); loadQueue(); }
    catch (err) { guard(err); }
  };
  const saveVmMode = async (m: "listen" | "skip" | "drop") => {
    setVmMode(m);
    try { await api("settings", { method: "POST", body: JSON.stringify({ vmMode: m }) }); }
    catch (err) { guard(err); }
  };
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
      if (data.unlisted !== undefined) setUnlistedCount(data.unlisted);
    } catch (err) { guard(err); }
  }, [guard]);
  useEffect(() => { if (authed) loadQueue(); }, [authed, loadQueue]);

  // When the queue is empty (or every lead is waiting out its retry gap),
  // back off for 30s instead of re-asking every poll tick — no toast spam,
  // and dialing resumes by itself once a gap elapses or leads are added.
  const emptyBackoffRef = useRef(0);
  const fireWave = useCallback(async (leadId?: number) => {
    if (refs.current.dialing) return;
    if (!leadId && Date.now() < emptyBackoffRef.current) return;
    setDialing(true);
    try {
      await api("dial", { method: "POST", body: JSON.stringify(leadId ? { leadId } : {}) });
      emptyBackoffRef.current = 0;
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("Queue is empty")) {
        if (Date.now() - emptyBackoffRef.current > 0) notify("Queue is empty (or every number is waiting out its retry gap)");
        emptyBackoffRef.current = Date.now() + 30_000;
      }
      // A wave is already live (the poll and a manual/auto trigger raced) —
      // benign: the running wave stands, nothing was skipped.
      else if (msg.includes("still in progress")) { /* no-op */ }
      else guard(err);
    } finally {
      setDialing(false);
      loadQueue();
    }
  }, [guard, notify, loadQueue]);

  // Manual dial — punch in any number from the header. The call is tracked
  // like every other (a lead row is created/reused server-side). With no
  // session running, one is auto-started (your saved web/phone mode) and the
  // number fires the moment audio connects; auto-dial is switched off so the
  // queue doesn't start calling behind your one-off call.
  const [manualPhone, setManualPhone] = useState("");
  const pendingManualRef = useRef("");
  const placeManualCall = async (phone: string) => {
    setDialing(true);
    try {
      await api("dial", { method: "POST", body: JSON.stringify({ phone }) });
      setManualPhone("");
      setTab("dial");
    } catch (err) { guard(err); } finally {
      setDialing(false);
      loadQueue();
    }
  };
  const dialNumber = async (raw: string) => {
    if (!raw.trim()) return;
    if (refs.current.dialing || refs.current.session?.waveActive) { notify("A call is already in progress"); return; }
    if (!refs.current.session?.active) {
      pendingManualRef.current = raw.trim();
      setAutoDial(false);
      setTab("dial");
      notify(callMode === "browser" ? "Connecting your session — the call fires as soon as audio is up" : "Starting a session — answer your phone, then the call fires");
      const ok = await startSession();
      if (!ok) pendingManualRef.current = "";
      return;
    }
    setTab("dial");
    await placeManualCall(raw.trim());
  };
  const dialManual = () => dialNumber(manualPhone);

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

        // Only a genuine live human becomes a "mark this lead" card. A
        // voicemail we auto-skipped (winnerResolved) never stops the flow.
        if (s.winnerLead && !s.winnerResolved) {
          setPending((prev: any) => (prev?.id === s.winnerLead.id ? prev : s.winnerLead));
        }
        // Wave finished: human hung up, voicemail skipped, or nobody answered.
        if (!s.waveActive && !refs.current.dialing) {
          const needsMark = Boolean(s.winnerLead) && !s.winnerResolved;
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

  // Auto-dial the first wave as soon as the agent picks up their phone. A
  // pending manual number (dialed before the session existed) takes priority
  // and suppresses the queue kick.
  const kickedRef = useRef(false);
  useEffect(() => {
    if (!session.active) { kickedRef.current = false; return; }
    if (!session.agentAnswered || session.waveActive || session.winnerLead || kickedRef.current) return;
    if (pendingManualRef.current) {
      const ph = pendingManualRef.current;
      pendingManualRef.current = "";
      kickedRef.current = true;
      if (!refs.current.dialing) placeManualCall(ph);
      return;
    }
    if (autoDial) {
      kickedRef.current = true;
      fireWave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.active, session.agentAnswered, session.waveActive, session.winnerLead, autoDial, fireWave]);

  // Browser calling: the Voice SDK device lives for the session's lifetime.
  const deviceRef = useRef<any>(null);
  const destroyDevice = () => {
    try { deviceRef.current?.destroy(); } catch {}
    deviceRef.current = null;
  };

  // Ringback tone (web calling only): the conference bridge means the agent
  // otherwise hears dead silence while a lead's phone rings. Synthesize a US
  // ringback (440+480 Hz, 2s on / 4s off) in-tab — no Twilio round-trip, so it
  // stops the instant the human answers with zero risk of talking over them.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringRef = useRef<any>(null);
  const ensureAudioCtx = () => {
    try {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return null;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume().catch(() => {});
      return audioCtxRef.current;
    } catch { return null; }
  };
  const stopRingback = () => {
    const r = ringRef.current;
    if (!r) return;
    ringRef.current = null;
    try { clearInterval(r.timer); } catch {}
    try { r.gain.gain.cancelScheduledValues(r.ctx.currentTime); r.gain.gain.value = 0; } catch {}
    try { r.osc1.stop(); r.osc2.stop(); } catch {}
  };
  const startRingback = () => {
    if (ringRef.current) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      const osc1 = ctx.createOscillator(); osc1.frequency.value = 440;
      const osc2 = ctx.createOscillator(); osc2.frequency.value = 480;
      osc1.connect(gain); osc2.connect(gain);
      osc1.start(); osc2.start();
      const ring = () => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(0.06, t);   // 2s tone
        gain.gain.setValueAtTime(0, t + 2);  // then 4s of silence
      };
      ring();
      const timer = setInterval(ring, 6000);
      ringRef.current = { ctx, gain, osc1, osc2, timer };
    } catch { /* audio unavailable — fall back to silence */ }
  };
  // Ring while a lead is actually ringing (wave live, no one bridged yet), web
  // mode only; stop on answer, wave end, or session end.
  const ringActive = callMode === "browser" && session.active && session.agentAnswered && session.waveActive && !session.winnerCall;
  useEffect(() => {
    if (ringActive) startRingback(); else stopRingback();
  }, [ringActive]);
  // If auth drops (poll 401s) or we sign out, the poll interval is torn down
  // and session freezes — make sure the tone doesn't keep playing under the
  // login screen.
  useEffect(() => { if (!authed) stopRingback(); }, [authed]);
  useEffect(() => () => { stopRingback(); try { audioCtxRef.current?.close(); } catch {} }, []);

  const startSession = async () => {
    setBusy(true);
    try {
      if (callMode === "browser") {
        ensureAudioCtx(); // unlock audio inside the click so ringback can play
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
          notify("Connected through your browser — dialing starts now");
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
        notify("Answer your phone — dialing starts automatically");
      }
      return true;
    } catch (err) { guard(err); return false; } finally { setBusy(false); }
  };
  const stopSession = async () => {
    setBusy(true);
    pendingManualRef.current = "";
    try {
      stopRingback();
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
  // Next lead → : ends the current wave (connected call hung up + auto-marked,
  // or every ringing leg canceled) and dials the next batch right away. The
  // manual escape hatch for voicemails the verdict missed and iPhone
  // call-screening robots.
  const [skipping, setSkipping] = useState(false);
  const skipNext = async (context: "ringing" | "connected") => {
    if (skipping) return;
    setSkipping(true);
    try {
      await api("call-action", { method: "POST", body: JSON.stringify({ action: "skip", context }) });
      setPending(null);
      notify("Skipped — dialing next");
      if (refs.current.autoDial && refs.current.session?.active) {
        setTimeout(() => fireWave(), 500);
      }
    } catch (err) { guard(err); } finally { setSkipping(false); }
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
      notify("Text sent");
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
      p.set("limit", "2000");
      const data = await api(`leads?${p}`);
      setLeads(data.leads || []);
      const c: Record<string, number> = {};
      (data.counts || []).forEach((r: any) => (c[r.status] = r.n));
      setCounts(c);
      if (data.states) setStateOptions(data.states);
      if (data.lists) setListOptions(data.lists);
      if (data.industries) setIndustryOptions(data.industries);
      if (data.unlisted !== undefined) setUnlistedCount(data.unlisted);
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
  const renameList = async (name: string) => {
    const to = prompt(name ? `Rename list "${name}" to:` : "Give these unlisted leads a list name:", name);
    if (!to?.trim() || to.trim() === name) return;
    try {
      const res = await api("lists", { method: "PATCH", body: JSON.stringify({ from: name, to: to.trim(), unlisted: !name }) });
      notify(`List renamed (${res.renamed} leads)`);
      if (leadListFilter === name) setLeadListFilter(to.trim());
      loadLeads(); loadQueue();
    } catch (err) { guard(err); }
  };
  const deleteList = async (name: string) => {
    const label = name ? `the entire "${name}" list` : "ALL leads that aren't in any list";
    if (!confirm(`Delete ${label} AND all its leads? DNC records are kept. This can't be undone.`)) return;
    try {
      const res = await api("lists", { method: "DELETE", body: JSON.stringify({ name, unlisted: !name }) });
      notify(`Deleted ${res.deleted} leads${res.keptDnc ? ` · kept ${res.keptDnc} DNC` : ""}`);
      if (leadListFilter === name) setLeadListFilter("");
      loadLeads(); loadQueue();
    } catch (err) { guard(err); }
  };
  useEffect(() => { if (authed && tab === "leads") loadLeads(); }, [authed, tab, loadLeads]);

  const importRows = async (rows: { name: string; business: string; phone: string; industry?: string }[], listName = "") => {
    if (!rows.length) { setUploadMsg("No valid phone numbers to import."); return null; }
    try {
      const res = await api("leads", { method: "POST", body: JSON.stringify({ rows, listName }) });
      setUploadMsg(`${res.added} added · ${res.updated} already existed (history kept) · ${res.skipped} skipped`);
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

  // ── leads pagination + bulk selection ──
  const [leadPage, setLeadPage] = useState(0);
  const [leadPageSize, setLeadPageSize] = useState<number>(LEAD_PAGE_SIZES[0]);
  const [selectedLeads, setSelectedLeads] = useState<number[]>([]);
  useEffect(() => { setLeadPage(0); setSelectedLeads([]); }, [leadFilter, leadStateFilter, leadListFilter, leadIndustryFilter, leadSearch]);
  useEffect(() => { setLeadPage(0); }, [leadPageSize]);
  const leadPages = Math.max(1, Math.ceil(leads.length / leadPageSize));
  useEffect(() => { if (leadPage > leadPages - 1) setLeadPage(leadPages - 1); }, [leadPage, leadPages]);
  const pageLeads = leads.slice(leadPage * leadPageSize, (leadPage + 1) * leadPageSize);
  const toggleLead = (id: number, on: boolean) =>
    setSelectedLeads((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  const togglePage = (on: boolean) =>
    setSelectedLeads((s) => {
      const pageIds = pageLeads.map((l) => l.id);
      return on ? [...new Set([...s, ...pageIds])] : s.filter((x) => !pageIds.includes(x));
    });
  const bulkStatus = async (status: string) => {
    const n = selectedLeads.length;
    try {
      await api("leads", { method: "PATCH", body: JSON.stringify({ ids: selectedLeads, status }) });
      notify(`${n} lead${n === 1 ? "" : "s"} marked ${STATUS_META[status as keyof typeof STATUS_META]?.label || status}`);
      setSelectedLeads([]);
      loadLeads(); loadQueue();
    } catch (err) { guard(err); }
  };
  const bulkDelete = async () => {
    const n = selectedLeads.length;
    if (!confirm(`Delete ${n} selected lead${n === 1 ? "" : "s"} and their call history? DNC records are kept. This can't be undone.`)) return;
    try {
      const res = await api("leads", { method: "DELETE", body: JSON.stringify({ ids: selectedLeads }) });
      notify(`Deleted ${res.deleted} leads${res.keptDnc ? ` · kept ${res.keptDnc} DNC` : ""}`);
      setSelectedLeads([]);
      loadLeads(); loadQueue();
    } catch (err) { guard(err); }
  };

  // ── texts ──
  const [threads, setThreads] = useState<any[]>([]);
  const [textSource, setTextSource] = useState("");
  const [textRange, setTextRange] = useState("");
  const [textDay, setTextDay] = useState("");
  const filteredThreads = threads.filter((t) => {
    if (textSource && threadSource(t) !== textSource) return false;
    if (textDay) return localDay(t.created_at) === textDay;
    if (textRange) {
      const cutoff =
        textRange === "today"
          ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
          : Date.now() - (textRange === "7d" ? 7 : 30) * 86_400_000;
      return new Date(t.created_at).getTime() >= cutoff;
    }
    return true;
  });
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
  const deleteThread = async (phone: string, label: string) => {
    if (!confirm(`Delete the conversation with ${label}? This clears the messages from your inbox (the number isn't blocked — a new reply reopens it).`)) return;
    try {
      await api("sms", { method: "DELETE", body: JSON.stringify({ phone }) });
      if (openPhone === phone) { setOpenPhone(""); setMessages([]); }
      loadThreads();
    } catch (err) { guard(err); }
  };
  const deleteMessage = async (id: number) => {
    try {
      await api("sms", { method: "DELETE", body: JSON.stringify({ messageId: id }) });
      setMessages((ms) => ms.filter((m) => m.id !== id));
      loadThreads();
    } catch (err) { guard(err); }
  };

  // ── demo-line calls (Custom Demo = montivaro catch-all + dentist +
  // contractors verticals; Prime Barber and the $97 Website line get their
  // own pages) ──
  const [catchallCalls, setCatchallCalls] = useState<any[]>([]);
  useEffect(() => {
    if (!(authed && (tab === "catchall" || tab === "primebarber" || tab === "website"))) return;
    setCatchallCalls([]);
    const product =
      tab === "primebarber" ? "primebarber"
      : tab === "website" ? "website"
      : "montivaro,dentist,contractors";
    api(`catchall?product=${product}`).then((d) => setCatchallCalls(d.calls || [])).catch(guard);
  }, [authed, tab, guard]);
  const deleteCatchall = async (id: number, label: string) => {
    if (!confirm(`Delete this call from ${label}? The SMS conversation (if any) stays in Texts.`)) return;
    try {
      await api("catchall", { method: "DELETE", body: JSON.stringify({ id }) });
      setCatchallCalls((cs) => cs.filter((c) => c.id !== id));
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
        {/* Left rail — brand + section nav, the CRM-console shape. */}
        <aside className="dlr-side">
          <div className="dlr-brand">
            <span className="dlr-brand-dot" aria-hidden="true" />
            Montivaro
          </div>
          <nav className="dlr-tabs">
            {(["dial", "leads", "texts", "calls"] as const).map((t) =>
              t === "leads" ? (
                <span key={t} className="dlr-tabwrap">
                  <button
                    onClick={() => setTab("leads")}
                    className={`dlr-tab${tab === "leads" || tab === "catchall" || tab === "primebarber" || tab === "website" ? " active" : ""}`}
                    aria-haspopup="menu"
                  >
                    {tab === "catchall" ? "Custom Demo" : tab === "primebarber" ? "Prime Barber" : tab === "website" ? "Website Design" : "Leads"} ▾
                  </button>
                  <span className="dlr-tabmenu" role="menu">
                    <button role="menuitem" onClick={() => setTab("leads")} className={tab === "leads" ? "on" : ""}>All leads</button>
                    <button role="menuitem" onClick={() => setTab("catchall")} className={tab === "catchall" ? "on" : ""}>Custom Demo Calls</button>
                    <button role="menuitem" onClick={() => setTab("primebarber")} className={tab === "primebarber" ? "on" : ""}>Prime Barber Calls</button>
                    <button role="menuitem" onClick={() => setTab("website")} className={tab === "website" ? "on" : ""}>Website Design Calls</button>
                  </span>
                </span>
              ) : (
                <button key={t} onClick={() => setTab(t)} className={`dlr-tab${tab === t ? " active" : ""}`}>
                  {TAB_LABELS[t]}
                  {t === "texts" && unread > 0 && <span className="badge">{unread}</span>}
                </button>
              )
            )}
          </nav>
        </aside>

        <div className="dlr-main">
        <header className="dlr-top">
          <div>
            <p className="dlr-eyebrow">Command Center</p>
            <h1 className="dlr-display" style={{ fontSize: 21, marginTop: 2, fontWeight: 700 }}>
              {tab === "dial" ? "Dashboard" : tab === "texts" ? "Messages" : tab === "calls" ? "Call log" : "Leads"}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <form
              onSubmit={(e) => { e.preventDefault(); dialManual(); }}
              style={{ display: "flex", gap: 6 }}
              title={session.active ? "Dial any number through the live session" : "Dial any number — a session starts automatically"}
            >
              <input
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                placeholder="Dial a number…"
                inputMode="tel"
                className="dlr-input dlr-mono"
                style={{ width: 150, padding: "8px 10px", fontSize: 12.5 }}
                aria-label="Dial a number manually"
              />
              <button type="submit" disabled={!manualPhone.trim() || dialing} className="dlr-btn" style={{ padding: "8px 11px" }} aria-label="Call this number">
                <Icon name="phone" />
              </button>
            </form>
          </div>
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
                      <button onClick={() => saveCallMode("browser")} className={`dlr-chip${callMode === "browser" ? " on" : ""}`}><Icon name="headset" /> Web calling (this tab)</button>
                      <button onClick={() => saveCallMode("phone")} className={`dlr-chip${callMode === "phone" ? " on" : ""}`}><Icon name="phone" /> Call my phone</button>
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
                    <label className="dlr-label">Retries</label>
                    <p className="dlr-sub" style={{ marginTop: 2 }}>
                      {redialAttempts === 1
                        ? "One try per number per day. Bump it up and unreached leads (voicemail / no answer) cycle back into the queue after the wait, up to your limit."
                        : `Each number gets up to ${redialAttempts} tries in 24 hours, at least ${redialGapHours}h apart. Only unreached leads retry — anyone you marked stays marked.`}
                    </p>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <select value={redialAttempts} onChange={(e) => saveRetry({ redialAttempts: Number(e.target.value) })} className="dlr-select dlr-select-sm" aria-label="Tries per number per day">
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>{n}× per day</option>
                        ))}
                      </select>
                      {redialAttempts > 1 && (
                        <select value={redialGapHours} onChange={(e) => saveRetry({ redialGapHours: Number(e.target.value) })} className="dlr-select dlr-select-sm" aria-label="Hours between tries">
                          {[1, 2, 3, 4, 6].map((n) => (
                            <option key={n} value={n}>wait {n}h between tries</option>
                          ))}
                        </select>
                      )}
                      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--smoke)" }}>
                        <input type="checkbox" checked={dialShuffle} onChange={(e) => saveRetry({ dialShuffle: e.target.checked })} />
                        Random order
                      </label>
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

                  <div style={{ marginTop: 18 }}>
                    <label className="dlr-label" htmlFor="dlr-vmmode">When it reaches a voicemail</label>
                    <p className="dlr-sub" style={{ marginTop: 2 }}>
                      {vmMode === "listen"
                        ? "Bridges you in so you can decide — you mark it yourself."
                        : vmMode === "drop"
                        ? "Auto-detects the machine, leaves your voicemail script, marks the lead “Voicemail,” and moves on."
                        : "Auto-detects the machine, marks the lead “Voicemail,” and jumps to the next number — no listening."}
                    </p>
                    <select id="dlr-vmmode" value={vmMode} onChange={(e) => saveVmMode(e.target.value as "listen" | "skip" | "drop")} className="dlr-select" style={{ marginTop: 6 }}>
                      <option value="skip">Skip &amp; mark voicemail — go to next (recommended)</option>
                      <option value="drop">Leave my voicemail, mark it, then go to next</option>
                      <option value="listen">Let me decide — bridge me in</option>
                    </select>
                  </div>

                  <button onClick={startSession} disabled={busy || (callMode === "phone" && !agentPhone)} className="dlr-btn go big" style={{ marginTop: 20 }}>
                    <Icon name="play" size={12} />{callMode === "browser" ? " Start session — talk in this tab" : " Start session — call my phone"}
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
                      <span className={`dlr-lamp${connected ? " live" : ringing || dialing ? " ringing" : session.agentAnswered ? " live" : " ringing"}`} />
                      {session.agentAnswered ? "Session live" : callMode === "browser" ? "Connecting your browser…" : "Ringing your phone…"}
                    </h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="dlr-eyebrow" style={{ color: connected ? "var(--live)" : ringing || dialing ? "var(--paper)" : "var(--smoke-d)" }}>
                        Line 01 · {connected ? "Live" : ringing || dialing ? "Ringing" : "Standby"}
                      </span>
                      <button onClick={stopSession} disabled={busy} className="dlr-btn danger">End</button>
                    </div>
                  </div>

                  {session.lastAuto && (
                    <p className="dlr-sub" style={{ marginTop: 10, fontSize: 12 }}>
                      Last:{" "}
                      <span style={{ color: "var(--paper)" }}>{session.lastAuto.business || session.lastAuto.name || "Lead"}</span>
                      {" → "}
                      <span style={{ color: STATUS_META[session.lastAuto.outcome]?.color || "var(--smoke)" }}>
                        {STATUS_META[session.lastAuto.outcome]?.label || session.lastAuto.outcome}
                        {session.lastAuto.outcome === "voicemail" && vmMode === "drop" ? " (dropped)" : ""}
                      </span>
                    </p>
                  )}

                  {!session.agentAnswered && (
                    <p className="dlr-sub" style={{ marginTop: 14 }}>
                      {callMode === "browser" ? "Allow the microphone if asked — dialing starts as soon as audio connects." : "Pick up — dialing begins the moment you answer."}
                    </p>
                  )}

                  {session.agentAnswered && (pending || ringing || dialing) ? (
                    <div className={`dlr-live${connected ? " connected" : ""}`} style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <p className="dlr-eyebrow" style={{ color: connected ? "var(--live)" : "var(--smoke)" }}>
                          {connected ? "Connected" : pending ? "Call ended — mark it" : `Dialing ${session.waveLeads?.length || lines}…`}
                        </p>
                        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {(ringing || dialing) && <Wave />}
                          {ringing && !connected && (
                            <button onClick={() => skipNext("ringing")} disabled={skipping} className="dlr-btn" style={{ padding: "6px 12px", fontSize: 12 }}>Next lead →</button>
                          )}
                        </span>
                      </div>

                      {pending ? (
                        <>
                          <p className="dlr-name-lg" style={{ marginTop: 10 }}>{pending.name || "Unknown"}</p>
                          <p className="dlr-company-lg" style={{ marginTop: 2 }}>{pending.business || "—"}</p>
                          <p className="dlr-phone-lg" style={{ marginTop: 5 }}>{fmtPhone(pending.phone)}</p>
                          {w?.amd && (
                            <p style={{ marginTop: 10, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, color: w.amd === "human" ? "var(--live)" : "var(--violet)" }}>
                              {w.amd === "human" ? <><Icon name="user" /> Human answered</> : <><Icon name="bot" /> Machine detected ({w.amd})</>}
                            </p>
                          )}
                          {connected && (
                            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                              <button onClick={() => callAction("vmdrop")} className="dlr-btn violet"><Icon name="tape" /> Drop voicemail</button>
                              <button onClick={() => callAction("hangup")} className="dlr-btn danger">Hang up</button>
                              <button onClick={() => skipNext("connected")} disabled={skipping} className="dlr-btn" title="Hang up, auto-mark, and dial the next lead">Next lead →</button>
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
                              <Icon name="save" />
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
                                <button onClick={() => mark("text_interested", templates[selectedTemplate])} className="dlr-btn" style={{ borderColor: "rgba(96,165,250,0.5)", color: "#60a5fa" }}>
                                  <Icon name="check" /> SMS interested + send
                                </button>
                                <button onClick={() => quickText(templates[selectedTemplate])} className="dlr-btn">
                                  <Icon name="chat" /> Send only
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
                              <p className="dlr-sub" style={{ marginTop: 2, fontSize: 11 }}>{l.status === "in-progress" ? "answered" : l.status === "ringing" ? "ringing…" : l.status || "dialing…"}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : session.agentAnswered ? (
                    <div style={{ marginTop: 16 }}>
                      <button onClick={() => fireWave()} disabled={dialing || !queue.length} className="dlr-btn primary big">
                        {queue.length ? <><Icon name="phone" /> Dial next {lines > 1 ? `${lines} leads` : ""}</> : "Queue empty — add leads"}
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
                <div className="dlr-stat"><p className="n dlr-mono" style={{ color: "var(--violet)" }}>{counts.voicemail || 0}</p><p className="k dlr-eyebrow">Voicemail</p></div>
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
              </div>
              {(listOptions.length > 0 || unlistedCount > 0) && (
                <div style={{ marginTop: 14 }}>
                  <label className="dlr-label" style={{ display: "block", marginBottom: 6 }}>Your lists</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {unlistedCount > 0 && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px dashed var(--line-2)", borderRadius: 7, padding: "4px 4px 4px 11px", fontSize: 12.5 }}>
                        <span style={{ color: "var(--smoke)", fontWeight: 600 }}>No list</span>
                        <span className="dlr-mono" style={{ color: "var(--smoke-d)", fontSize: 11 }}>· {unlistedCount}</span>
                        <button onClick={() => renameList("")} className="dlr-btn" style={{ padding: "4px 7px", border: 0 }} title="Give these leads a list name" aria-label="Name the unlisted leads"><Icon name="edit" size={12} /></button>
                        <button onClick={() => deleteList("")} className="dlr-btn danger" style={{ padding: "4px 7px", border: 0 }} title="Delete all unlisted leads (DNC kept)" aria-label="Delete unlisted leads"><Icon name="trash" size={12} /></button>
                      </span>
                    )}
                    {listOptions.map((l) => (
                      <span key={l.list_name} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--line-2)", borderRadius: 7, padding: "4px 4px 4px 11px", fontSize: 12.5 }}>
                        <span style={{ color: "var(--paper)", fontWeight: 600 }}>{l.list_name}</span>
                        <span className="dlr-mono" style={{ color: "var(--smoke-d)", fontSize: 11 }}>· {l.n}</span>
                        <button onClick={() => renameList(l.list_name)} className="dlr-btn" style={{ padding: "4px 7px", border: 0 }} title={`Rename "${l.list_name}"`} aria-label={`Rename list ${l.list_name}`}><Icon name="edit" size={12} /></button>
                        <button onClick={() => deleteList(l.list_name)} className="dlr-btn danger" style={{ padding: "4px 7px", border: 0 }} title={`Delete "${l.list_name}" and its leads (DNC kept)`} aria-label={`Delete list ${l.list_name}`}><Icon name="trash" size={12} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--smoke)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={pageLeads.length > 0 && pageLeads.every((l) => selectedLeads.includes(l.id))}
                    onChange={(e) => togglePage(e.target.checked)}
                    style={{ accentColor: "var(--paper)" }}
                  />
                  Select page
                </label>
                {selectedLeads.length > 0 && (
                  <>
                    <span className="dlr-mono" style={{ fontSize: 11.5, color: "var(--smoke-d)" }}>{selectedLeads.length} selected</span>
                    {selectedLeads.length < leads.length && (
                      <button onClick={() => setSelectedLeads(leads.map((l) => l.id))} className="dlr-btn" style={{ padding: "5px 9px", fontSize: 11.5 }}>Select all {leads.length}</button>
                    )}
                    <select value="" onChange={(e) => { if (e.target.value) bulkStatus(e.target.value); }} className="dlr-select" style={{ width: "auto", padding: "6px 9px", fontSize: 12 }} aria-label="Mark selected leads as">
                      <option value="">Mark as…</option>
                      {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                    </select>
                    <button onClick={bulkDelete} className="dlr-btn danger" style={{ padding: "6px 11px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="trash" size={13} /> Delete selected</button>
                    <button onClick={() => setSelectedLeads([])} className="dlr-btn" style={{ padding: "6px 9px", fontSize: 11.5 }}>Clear</button>
                  </>
                )}
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={leadPageSize}
                    onChange={(e) => setLeadPageSize(Number(e.target.value))}
                    className="dlr-select"
                    style={{ width: "auto", padding: "5px 8px", fontSize: 11.5 }}
                    aria-label="Leads per page"
                  >
                    {LEAD_PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  <span className="dlr-mono" style={{ fontSize: 11.5, color: "var(--smoke-d)" }}>
                    {leads.length} lead{leads.length === 1 ? "" : "s"}{leadPages > 1 ? ` · page ${leadPage + 1}/${leadPages}` : ""}
                  </span>
                </span>
              </div>
              <ul style={{ marginTop: 12, display: "grid", gap: 7 }}>
                {pageLeads.map((l) => (
                  <li key={l.id} className="dlr-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <input
                        type="checkbox"
                        checked={selectedLeads.includes(l.id)}
                        onChange={(e) => toggleLead(l.id, e.target.checked)}
                        style={{ accentColor: "var(--paper)", flexShrink: 0 }}
                        aria-label={`Select ${l.name || l.business || fmtPhone(l.phone)}`}
                      />
                      <span style={{ minWidth: 0, flex: 1 }}>
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
                        <button title="Text" onClick={() => { setTab("texts"); openThread(l.phone, l); }} className="dlr-btn" style={{ padding: "7px 11px" }}><Icon name="chat" /></button>
                        <button title="Edit" onClick={() => { setExpandedLead(expandedLead === l.id ? null : l.id); setEditDraft({ name: l.name || "", business: l.business || "", notes: l.notes || "", industry: l.industry || "" }); }} className="dlr-btn" style={{ padding: "7px 11px" }}><Icon name="edit" /></button>
                        <button title="Delete" onClick={() => deleteLead(l.id, l.name || l.business || fmtPhone(l.phone))} className="dlr-btn danger" style={{ padding: "7px 11px" }}><Icon name="trash" /></button>
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
              {leadPages > 1 && (
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <button onClick={() => setLeadPage((p) => Math.max(0, p - 1))} disabled={leadPage === 0} className="dlr-btn" style={{ padding: "7px 13px" }}>‹ Prev</button>
                  <span className="dlr-mono" style={{ fontSize: 12, color: "var(--smoke)" }}>Page {leadPage + 1} of {leadPages}</span>
                  <button onClick={() => setLeadPage((p) => Math.min(leadPages - 1, p + 1))} disabled={leadPage >= leadPages - 1} className="dlr-btn" style={{ padding: "7px 13px" }}>Next ›</button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ══ TEXTS ══ */}
        {/* ══ CATCH-ALL CALLS ══ */}
        {(tab === "catchall" || tab === "primebarber" || tab === "website") && (
          <section className="dlr-panel dlr-panel-p">
            <h2 className="dlr-h dlr-display">{tab === "primebarber" ? "Prime Barber Calls" : tab === "website" ? "Website Design Calls" : "Custom Demo Calls"}</h2>
            <p className="dlr-sub">{tab === "primebarber"
              ? "Every call the Prime Barber line takes lands here automatically — number, summary, full conversation, and the recording."
              : tab === "website"
                ? "Every call the $97/month Website System line takes lands here automatically — number, summary, full conversation, and the recording."
                : "Every call your Montivaro demo assistant takes lands here automatically — number, summary, full conversation, and the recording."}</p>
            <ul style={{ marginTop: 16, display: "grid", gap: 10 }}>
              {catchallCalls.map((c) => (
                <li key={c.id} className="dlr-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ minWidth: 0 }}>
                      <span className="dlr-name">{c.name || c.business || (c.phone ? fmtPhone(c.phone) : "Web call")}</span>
                      {c.business && c.name && <span className="dlr-company" style={{ marginLeft: 7 }}>· {c.business}</span>}
                      {c.phone && (c.name || c.business) && <span className="dlr-phone" style={{ marginLeft: 8 }}>{fmtPhone(c.phone)}</span>}
                      <span className="dlr-mono" style={{ display: "block", marginTop: 3, fontSize: 11.5, color: "var(--smoke-d)" }}>
                        {timeAgo(c.created_at)}{c.duration_seconds ? ` · ${mmss(c.duration_seconds)}` : ""}
                        {c.qualified ? " · qualified ✓" : ""}
                        {c.product === "dentist" ? " · Dentist" : c.product === "contractors" ? " · Contractors" : ""}
                      </span>
                    </span>
                    <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {c.phone && (
                        <>
                          <button title="Text them" onClick={() => { setTab("texts"); openThread(c.phone, { name: c.name, business: c.business, phone: c.phone }); }} className="dlr-btn" style={{ padding: "7px 11px" }}><Icon name="chat" /></button>
                          <button title="Call them" onClick={() => dialNumber(c.phone)} className="dlr-btn" style={{ padding: "7px 11px" }}><Icon name="phone" /></button>
                        </>
                      )}
                      <button title="Delete" onClick={() => deleteCatchall(c.id, c.name || c.business || (c.phone ? fmtPhone(c.phone) : "this caller"))} className="dlr-btn danger" style={{ padding: "7px 11px" }}><Icon name="trash" /></button>
                    </span>
                  </div>
                  {c.summary && <p className="dlr-sub" style={{ marginTop: 0 }}>{c.summary}</p>}
                  {c.recording_url && (
                    <audio controls preload="none" style={{ width: "100%", height: 34 }} src={c.recording_url} />
                  )}
                  {c.transcript && (
                    <details>
                      <summary className="dlr-sub" style={{ cursor: "pointer", marginTop: 0 }}>Full conversation</summary>
                      <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.6, color: "var(--smoke)", maxHeight: 300, overflowY: "auto" }} className="dlr-scroll">{c.transcript}</pre>
                    </details>
                  )}
                </li>
              ))}
              {!catchallCalls.length && <li className="dlr-sub">{tab === "primebarber"
                ? "No Prime Barber calls yet — they appear here the moment a barber calls the line."
                : tab === "website"
                  ? "No Website Design calls yet — they appear here the moment a business owner calls the line."
                  : "No demo calls yet — they appear here the moment someone calls your demo assistant."}</li>}
            </ul>
          </section>
        )}

        {tab === "texts" && (
          <div className="dlr-grid split">
            <section className="dlr-panel dlr-panel-p">
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="New text: phone…" className="dlr-input" />
                <button onClick={() => { const d = newPhone.replace(/\D/g, ""); if (d.length >= 10) { openThread(`+1${d.slice(-10)}`); setNewPhone(""); } }} className="dlr-btn">Open</button>
              </div>
              {/* Filters: which line the number came through + date */}
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 7 }}>
                <select value={textSource} onChange={(e) => setTextSource(e.target.value)} className="dlr-select" style={{ width: "auto", flex: 1, minWidth: 120, padding: "6px 8px", fontSize: 11.5 }} aria-label="Filter by line">
                  <option value="">All texts</option>
                  <option value="leads">Dialer leads</option>
                  <option value="catchall">Custom Demo</option>
                  <option value="primebarber">Prime Barber</option>
                  <option value="website">Website Design</option>
                </select>
                <select value={textRange} onChange={(e) => { setTextRange(e.target.value); setTextDay(""); }} className="dlr-select" style={{ width: "auto", padding: "6px 8px", fontSize: 11.5 }} aria-label="Filter by period">
                  <option value="">All time</option>
                  <option value="today">Today</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
                <input type="date" value={textDay} onChange={(e) => { setTextDay(e.target.value); setTextRange(""); }} className="dlr-input" style={{ width: "auto", padding: "6px 8px", fontSize: 11.5 }} aria-label="Filter by exact date" />
              </div>
              <ul className="dlr-scroll" style={{ marginTop: 12, display: "grid", gap: 6, maxHeight: 460 }}>
                {filteredThreads.map((t) => (
                  <li key={t.phone} className="dlr-thread-row" style={{ position: "relative" }}>
                    <button onClick={() => openThread(t.phone, t)} className="dlr-row" style={{ width: "100%", textAlign: "left", cursor: "pointer", padding: "12px 14px", background: openPhone === t.phone ? "rgba(246,246,244,0.05)" : "transparent", borderColor: openPhone === t.phone ? "var(--line-2)" : "var(--line)" }}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span className="dlr-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.name || t.business || fmtPhone(t.phone)}
                          </span>
                          {t.unread > 0 && <span className="dlr-pill" style={{ background: "var(--live)", color: "#04160f", borderColor: "var(--live)" }}>{t.unread}</span>}
                        </span>
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginTop: 3, fontSize: 11.5, lineHeight: 1.5, color: "var(--smoke-d)", overflow: "hidden", paddingRight: 22 }}>
                          {t.direction === "in" ? "↩ " : ""}{t.body}
                        </span>
                        <span className="dlr-mono" style={{ display: "block", marginTop: 4, fontSize: 10, color: "var(--smoke-d)", opacity: 0.8 }}>
                          {fmtDateTime(t.created_at)}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => deleteThread(t.phone, t.name || t.business || fmtPhone(t.phone))}
                      className="dlr-thread-del"
                      title="Delete conversation"
                      aria-label="Delete conversation"
                    ><Icon name="trash" /></button>
                  </li>
                ))}
                {!filteredThreads.length && <li className="dlr-sub">{threads.length ? "No conversations match these filters." : "No conversations yet."}</li>}
              </ul>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p className="dlr-label" style={{ margin: 0 }}>Text templates</p>
                  {!editingTemplates ? (
                    <button onClick={() => { setTemplateDraft(templates.length ? [...templates] : [""]); setEditingTemplates(true); }} className="dlr-btn" style={{ padding: "5px 10px", fontSize: 11 }}>Edit</button>
                  ) : (
                    <span style={{ display: "flex", gap: 6 }}>
                      {templateSaved && <span className="dlr-sub" style={{ marginTop: 0, color: "var(--live)" }}>Saved</span>}
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
                      <div key={m.id} className={`dlr-bubble-wrap ${m.direction === "out" ? "out" : "in"}`}>
                        <div className={`dlr-bubble ${m.direction === "out" ? "out" : "in"}`}>
                          <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</span>
                          <span style={{ display: "block", marginTop: 4, fontSize: 9.5, opacity: 0.55 }}>{m.direction === "out" ? "Sent" : "Received"} · {fmtDateTime(m.created_at)}</span>
                        </div>
                        <button onClick={() => deleteMessage(m.id)} className="dlr-msg-del" title="Delete message" aria-label="Delete message"><Icon name="x" size={11} /></button>
                      </div>
                    ))}
                    {!messages.length && <p className="dlr-sub" style={{ margin: "auto" }}>No messages yet — start the conversation below.</p>}
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
            <h2 className="dlr-h dlr-display">Conversations — last 24 hours</h2>
            <p className="dlr-sub">Only real calls with a prospect land here — voicemails, ring-outs, and abandoned waves are filtered out. Recordings delete themselves after 24 hours; the log line stays, the audio is gone for good.</p>
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
              {!callLog.length && <li className="dlr-sub">No conversations in the last 24 hours. Voicemails and no-answers are tracked on their leads, not here.</li>}
            </ul>
          </section>
        )}

        {/* ══ NUMBERS ══ */}
        </div>
      </div>
    </div>
  );
}
