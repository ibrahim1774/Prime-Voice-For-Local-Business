"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";

interface TranscriptEntry {
  role: "assistant" | "user";
  text: string;
  timestamp: number;
}

type CallStatus = "idle" | "connecting" | "active" | "ended";

interface DemoExperienceProps {
  assistantId: string;
  businessName: string;
}

export default function DemoExperience({
  assistantId,
  businessName,
}: DemoExperienceProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const vapiRef = useRef<Vapi | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Initialize Vapi
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
      setError(
        "Connection error. Please check your microphone permissions and try again."
      );
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
      await vapiRef.current.start(assistantId);
    } catch (err) {
      console.error("Failed to start call:", err);
      setError(
        "Failed to start call. Please allow microphone access and try again."
      );
      setCallStatus("idle");
    }
  }, [assistantId]);

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
    <div className="mx-auto max-w-2xl px-4 w-full">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-2 mb-6">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-sans text-xs font-medium text-gold uppercase tracking-wider">
            Live Demo
          </span>
        </div>

        <h1 className="font-serif text-3xl font-bold text-white md:text-5xl">
          Your AI Receptionist is Ready,{" "}
          <span className="text-gold">{businessName}</span>
        </h1>

        <p className="mt-4 font-sans text-muted max-w-lg mx-auto leading-relaxed">
          Click the button below to start a live call with your custom AI
          receptionist. Speak naturally — ask about your services, try to book an
          appointment, or see how it handles tough questions.
        </p>
      </div>

      {/* Call Controls */}
      <div className="flex justify-center gap-4 mb-10">
        {callStatus === "idle" && (
          <button
            onClick={startCall}
            className="group relative rounded-full bg-gold px-10 py-5 font-sans text-lg font-semibold text-background transition-all duration-300 hover:bg-gold-light hover:scale-[1.03] active:scale-[0.97] animate-pulse-glow"
          >
            <span className="flex items-center gap-3">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
              Call Your Receptionist
            </span>
          </button>
        )}

        {callStatus === "connecting" && (
          <button
            disabled
            className="rounded-full bg-gold/50 px-10 py-5 font-sans text-lg font-semibold text-background cursor-not-allowed"
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
                  ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border-white/20 bg-charcoal text-white hover:border-white/40"
              }`}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={endCall}
              className="rounded-full bg-red-600 px-10 py-4 font-sans text-base font-semibold text-white transition-all duration-300 hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="flex items-center gap-2">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
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
            }}
            className="rounded-full border border-gold/30 bg-transparent px-10 py-5 font-sans text-base font-semibold text-gold transition-all duration-300 hover:bg-gold/10 hover:scale-[1.02]"
          >
            Call Again
          </button>
        )}
      </div>

      {/* Active call indicator */}
      {callStatus === "active" && (
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2 text-sm text-emerald-400 font-sans">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Call in progress...
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-8 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center">
          <p className="text-sm text-red-400 font-sans">{error}</p>
        </div>
      )}

      {/* Live Transcript */}
      {transcript.length > 0 && (
        <div className="gold-glow-border rounded-2xl bg-card p-6 mb-10">
          <p className="font-sans text-xs uppercase tracking-[0.15em] text-subtle mb-5">
            Live Transcript
          </p>
          <div className="max-h-96 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {transcript.map((entry, index) => (
              <div
                key={index}
                className={
                  entry.role === "assistant"
                    ? "transcript-bubble-ai"
                    : "transcript-bubble-user"
                }
              >
                <p className="text-[11px] uppercase tracking-wider text-subtle mb-1 font-sans">
                  {entry.role === "assistant" ? "AI Receptionist" : "You"}
                </p>
                <p className="font-sans text-sm text-white leading-relaxed">
                  {entry.text}
                </p>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      {/* Post-call CTA */}
      {callStatus === "ended" && (
        <div className="gold-glow-border rounded-2xl bg-card p-8 md:p-10 text-center animate-fade-in-up">
          <h3 className="font-serif text-2xl font-bold text-white md:text-3xl">
            Imagine This Answering Every Call
            <br />
            <span className="text-gold">to Your Business, 24/7</span>
          </h3>
          <p className="mt-4 font-sans text-muted max-w-md mx-auto">
            No more missed calls. No more lost jobs. Get your own AI
            receptionist live on your business line today.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#"
              className="rounded-xl bg-gold px-8 py-4 font-sans text-base font-semibold text-background transition-all duration-300 hover:bg-gold-light hover:scale-[1.02]"
            >
              Get Started — $97/month
            </a>
            <a
              href="/"
              className="rounded-xl border border-white/10 bg-transparent px-8 py-4 font-sans text-base font-medium text-muted transition-all duration-300 hover:border-white/20 hover:text-white"
            >
              Try Another Demo
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
