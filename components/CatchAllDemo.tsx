"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { buildCatchallAssistant } from "@/lib/catchall-config.mjs";

interface TranscriptEntry {
  role: "assistant" | "user";
  text: string;
  timestamp: number;
}

type CallStatus = "idle" | "connecting" | "active" | "ended";

export default function CatchAllDemo() {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const vapiRef = useRef<Vapi | null>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollableRef.current) {
      scrollableRef.current.scrollTop = scrollableRef.current.scrollHeight;
    }
  }, [transcript]);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setError("Voice service configuration error. Please contact support.");
      return;
    }

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setCallStatus("active");
      setError(null);
    });
    vapi.on("call-end", () => {
      setCallStatus("ended");
    });
    vapi.on("message", (message: Record<string, unknown>) => {
      if (
        message.type === "transcript" &&
        message.transcriptType === "final" &&
        typeof message.transcript === "string" &&
        message.transcript.trim()
      ) {
        setTranscript((prev) => [
          ...prev,
          {
            role: message.role as "assistant" | "user",
            text: message.transcript as string,
            timestamp: Date.now(),
          },
        ]);
      }
    });
    vapi.on("error", (err: Record<string, unknown>) => {
      console.error("Vapi error:", err);
      let message = "Something went wrong with the call. Please try again.";
      try {
        const nested = err?.error as Record<string, unknown> | undefined;
        const innerMsg =
          (nested?.message as Record<string, unknown>)?.message ??
          nested?.message ??
          err?.message;
        if (typeof innerMsg === "string") {
          if (innerMsg.toLowerCase().includes("invalid key")) {
            message = "Voice service configuration error. Please contact support.";
          } else if (innerMsg.toLowerCase().includes("unauthorized")) {
            message = "Voice service authorization failed. Please contact support.";
          } else {
            message = innerMsg;
          }
        }
      } catch {
        // keep default message
      }
      setError(message);
      setCallStatus("idle");
    });

    return () => {
      vapi.stop();
    };
  }, []);

  const startCall = useCallback(async () => {
    if (!vapiRef.current) return;
    setCallStatus("connecting");
    setTranscript([]);
    setError(null);

    try {
      // Start a transient assistant inline from the shared config — no
      // pre-created assistant id, no env var. This is the SAME config the
      // phone assistant is built from (lib/catchall-config.mjs), minus the
      // server webhook (web leads stay in the Vapi dashboard rather than
      // exposing the Make.com URL in the browser bundle).
      const assistant = buildCatchallAssistant();
      await vapiRef.current.start(
        assistant as unknown as Parameters<typeof vapiRef.current.start>[0]
      );
    } catch (err) {
      console.error("Failed to start call:", err);
      const message =
        err instanceof Error ? err.message : "Unknown error starting call";
      setError(`Failed to start call: ${message}`);
      setCallStatus("idle");
    }
  }, []);

  const endCall = useCallback(() => {
    vapiRef.current?.stop();
  }, []);

  const toggleMute = useCallback(() => {
    if (!vapiRef.current) return;
    const newMuted = !isMuted;
    vapiRef.current.setMuted(newMuted);
    setIsMuted(newMuted);
  }, [isMuted]);

  return (
    <div className="min-h-[100dvh] w-full dotted-grid-bg">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 pt-6 pb-4">
        {/* Header */}
        <div className="shrink-0 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#e3e3e0] bg-white px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
              Live Demo
            </span>
          </div>

          <h1 className="font-serif text-xl font-bold text-foreground md:text-3xl">
            Call your AI receptionist — and watch it learn your business.
          </h1>

          <p className="mx-auto mt-2 max-w-lg font-sans text-sm leading-relaxed text-muted">
            Start a live call and just talk like a real customer would. Tell it
            what your business does — it&apos;ll show you exactly how it&apos;d answer
            your calls, book your jobs, and capture your leads.
          </p>

          <p className="mx-auto mt-2 max-w-lg font-sans text-xs leading-relaxed text-red-500">
            Note: please allow microphone access when prompted — the demo needs it
            to work. If denied, the call will fail.
          </p>
        </div>

        {/* Call controls */}
        <div className="mt-4 flex shrink-0 justify-center gap-4">
          {callStatus === "idle" && (
            <button
              onClick={startCall}
              className="group relative rounded-full bg-foreground px-10 py-5 font-sans text-lg font-semibold text-background transition-all duration-300 hover:bg-gold-light hover:scale-[1.03] active:scale-[0.97]"
            >
              <span className="flex items-center gap-3">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call Your Receptionist
              </span>
            </button>
          )}

          {callStatus === "connecting" && (
            <button
              disabled
              className="cursor-not-allowed rounded-full bg-foreground/50 px-10 py-5 font-sans text-lg font-semibold text-background"
            >
              <span className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full border-2 border-background/30 border-t-background animate-spin" />
                Connecting...
              </span>
            </button>
          )}

          {callStatus === "active" && (
            <>
              <button
                onClick={toggleMute}
                className={`rounded-full border px-6 py-4 font-sans text-sm font-medium transition-all duration-300 ${
                  isMuted
                    ? "border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20"
                    : "border-[#e3e3e0] bg-white text-foreground hover:border-[#c9c9c4]"
                }`}
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={endCall}
                className="rounded-full bg-red-600 px-10 py-4 font-sans text-base font-semibold text-white transition-all duration-300 hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98]"
              >
                End Call
              </button>
            </>
          )}

          {callStatus === "ended" && (
            <button
              onClick={() => {
                setCallStatus("idle");
                setTranscript([]);
              }}
              className="rounded-full border border-[#0a0a0a]/25 bg-transparent px-8 py-3.5 font-sans text-sm font-semibold text-foreground transition-all duration-300 hover:bg-foreground/[0.04]"
            >
              Call Again
            </button>
          )}
        </div>

        {/* Active indicator */}
        {callStatus === "active" && (
          <div className="mt-3 flex shrink-0 justify-center">
            <div className="flex items-center gap-2 font-sans text-sm text-emerald-600">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Call in progress...
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center">
            <p className="font-sans text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Transcript */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-[#e4e4e7] bg-white p-4 pb-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.06)]">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-muted">
              Live Transcript
            </p>
            {callStatus === "active" && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-600/80">
                  Listening...
                </span>
              </div>
            )}
          </div>
          <div
            ref={scrollableRef}
            className="custom-scrollbar flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto pr-2"
          >
            {transcript.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="font-sans text-sm italic text-subtle">
                  {callStatus === "active"
                    ? "Waiting for the conversation to begin..."
                    : "Start a call to see the live transcript here."}
                </p>
              </div>
            ) : (
              transcript.map((entry, index) => (
                <div
                  key={index}
                  className={
                    entry.role === "assistant"
                      ? "transcript-bubble-ai animate-fade-in-up"
                      : "transcript-bubble-user animate-fade-in-up"
                  }
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-wider text-muted/70">
                    {entry.role === "assistant" ? "AI Receptionist" : "You"}
                  </p>
                  <p
                    className={`font-sans text-[15px] leading-relaxed ${
                      entry.role === "assistant" ? "text-[#0a0a0a]" : "text-white"
                    }`}
                  >
                    {entry.text}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
