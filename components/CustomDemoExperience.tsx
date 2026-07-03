"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import CustomPricingSection from "./CustomPricingSection";

interface TranscriptEntry {
  role: "assistant" | "user";
  text: string;
  timestamp: number;
}

type CallStatus = "idle" | "connecting" | "active" | "ended";

interface CustomDemoExperienceProps {
  assistantId: string;
  businessName: string;
  voiceGender?: "female" | "male";
}

// Cartesia sonic-2 voices for the call-time override (same as the shared demo).
const FEMALE_VOICE_ID = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"; // Skylar
const MALE_VOICE_ID = "9fa83ce3-c3a8-4523-accc-173904582ced"; // Male voice

export default function CustomDemoExperience({
  assistantId,
  businessName,
  voiceGender = "female",
}: CustomDemoExperienceProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Pricing lives on this same screen. `revealed` collapses the transcript to a
  // summary bar and brings the pricing into view — triggered by the call ending
  // or by the user scrolling down. `transcriptOpen` re-expands the summary bar.
  const [revealed, setRevealed] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const vapiRef = useRef<Vapi | null>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);
  const didAutoScrollRef = useRef(false);

  // Auto-scroll the live transcript within its container.
  useEffect(() => {
    if (scrollableRef.current) {
      scrollableRef.current.scrollTop = scrollableRef.current.scrollHeight;
    }
  }, [transcript]);

  // Reveal pricing (and collapse transcript) once the user scrolls down.
  useEffect(() => {
    if (revealed) return;
    const onScroll = () => {
      if (window.scrollY > 80) setRevealed(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [revealed]);

  // When the call ends, collapse the transcript and glide the pricing into view.
  useEffect(() => {
    if (callStatus !== "ended") return;
    setRevealed(true);
    setTranscriptOpen(false);
    if (!didAutoScrollRef.current) {
      didAutoScrollRef.current = true;
      const t = setTimeout(() => {
        pricingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      return () => clearTimeout(t);
    }
  }, [callStatus]);

  // Initialize Vapi (identical call logic to the shared demo).
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
      await vapiRef.current.start(assistantId, {
        voice: {
          provider: "cartesia",
          voiceId: voiceGender === "male" ? MALE_VOICE_ID : FEMALE_VOICE_ID,
          model: "sonic-2",
          language: "en",
          experimentalControls: {
            speed: "normal",
            emotion: ["positivity:high"],
          },
          chunkPlan: {
            enabled: true,
            minCharacters: 40,
          },
        },
        transcriber: {
          provider: "deepgram",
          model: "nova-2",
          language: "en-US",
        },
        backgroundSound: "office",
      } as unknown as Parameters<typeof vapiRef.current.start>[1]);
    } catch (err) {
      console.error("Failed to start call:", err);
      const message =
        err instanceof Error ? err.message : "Unknown error starting call";
      setError(`Failed to start call: ${message}`);
      setCallStatus("idle");
    }
  }, [assistantId, voiceGender]);

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
      {/* ===== Call section ===== */}
      <section
        className={`mx-auto flex w-full max-w-2xl flex-col px-4 ${
          revealed ? "pt-6 pb-2" : "min-h-[100dvh] pt-6 pb-4"
        }`}
      >
        {/* Header */}
        <div className="shrink-0 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#e3e3e0] bg-white px-4 py-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
              Live Demo
            </span>
          </div>

          <h1
            className={`font-serif font-bold text-foreground ${
              revealed ? "text-lg md:text-xl" : "text-xl md:text-3xl"
            }`}
          >
            Your Voice Agent is Ready,{" "}
            <span className="text-muted">{businessName}</span>
          </h1>

          {!revealed && (
            <>
              <p className="mx-auto mt-2 max-w-lg font-sans text-sm leading-relaxed text-muted">
                Start a live call with your custom voice agent. Speak naturally —
                ask about your services, try to book an appointment, or see how it
                handles tough questions.
              </p>
              <p className="mx-auto mt-2 max-w-lg font-sans text-xs leading-relaxed text-red-500">
                Note: Please allow access to your microphone when prompted — the demo
                requires it to work. If denied, the call will fail.
              </p>
            </>
          )}
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
                Call Your Voice Agent
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
                <span className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  End Call
                </span>
              </button>
            </>
          )}

          {callStatus === "ended" && (
            <button
              onClick={() => {
                setCallStatus("idle");
                setTranscript([]);
                // Restore the full-height call view for the next call.
                setRevealed(false);
                setTranscriptOpen(false);
                didAutoScrollRef.current = false;
                window.scrollTo({ top: 0 });
              }}
              className="rounded-full border border-[#0a0a0a]/25 bg-transparent px-8 py-3.5 font-sans text-sm font-semibold text-foreground transition-all duration-300 hover:bg-foreground/[0.04]"
            >
              Call Again
            </button>
          )}
        </div>

        {/* Active call indicator */}
        {callStatus === "active" && !revealed && (
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

        {/* ===== Transcript ===== */}
        {!revealed ? (
          // Full-height live transcript during the call.
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
                      ? "Waiting for conversation to begin..."
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
                      {entry.role === "assistant" ? "Voice Agent" : "You"}
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
        ) : (
          // Collapsed summary bar (re-expandable).
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setTranscriptOpen((o) => !o)}
              aria-expanded={transcriptOpen}
              className="flex h-[60px] w-full items-center justify-between rounded-2xl border border-[#e3e3e0] bg-white px-4 transition-colors hover:border-[#c9c9c4]"
            >
              <span className="font-sans text-sm font-semibold text-foreground">
                Transcript · {transcript.length} message{transcript.length === 1 ? "" : "s"}
              </span>
              <svg
                className={`h-5 w-5 text-subtle transition-transform duration-200 ${
                  transcriptOpen ? "rotate-180" : ""
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {transcriptOpen && (
              <div className="custom-scrollbar mt-2 max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-[#e4e4e7] bg-white p-4">
                {transcript.length === 0 ? (
                  <p className="py-6 text-center font-sans text-sm italic text-subtle">
                    No transcript captured.
                  </p>
                ) : (
                  transcript.map((entry, index) => (
                    <div
                      key={index}
                      className={
                        entry.role === "assistant"
                          ? "transcript-bubble-ai"
                          : "transcript-bubble-user"
                      }
                    >
                      <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-wider text-muted/70">
                        {entry.role === "assistant" ? "Voice Agent" : "You"}
                      </p>
                      <p
                        className={`font-sans text-[14px] leading-relaxed ${
                          entry.role === "assistant" ? "text-[#0a0a0a]" : "text-white"
                        }`}
                      >
                        {entry.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===== Pricing (same screen, no redirect) ===== */}
      <div ref={pricingRef}>
        <CustomPricingSection businessName={businessName} />
      </div>
    </div>
  );
}
