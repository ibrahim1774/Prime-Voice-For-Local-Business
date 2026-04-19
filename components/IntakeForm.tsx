"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import LoadingOverlay from "./LoadingOverlay";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const EXAMPLE_PROMPTS = [
  "My business is Smith HVAC in Dallas and I want a male AI to answer calls and book service appointments.",
  "We run Acme Plumbing in Chicago. I need a female AI to handle after-hours emergency calls.",
  "Johnson Landscaping — I want an AI that books lawn-care quotes and answers pricing questions.",
  "My company is Precision Electric in Phoenix. I need help reducing missed calls during busy days.",
  "Brightside Roofing in Atlanta — I want a female AI that handles new customer intake and insurance estimates.",
];

const MINIMUM_LOADING_TIME = 4500;
const TYPE_SPEED_MS = 35;
const ERASE_SPEED_MS = 15;
const HOLD_AFTER_TYPE_MS = 2200;
const HOLD_AFTER_ERASE_MS = 400;

export default function IntakeForm() {
  const router = useRouter();
  const pathname = usePathname();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Typewriter placeholder state
  const [typedText, setTypedText] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "holding" | "erasing" | "waiting">("typing");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Capture UTM params + fbclid from URL on mount (client-only, no Suspense needed)
  const utmParamsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const params: Record<string, string> = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].forEach(
      (key) => {
        const value = urlParams.get(key);
        if (value) params[key] = value;
      }
    );
    utmParamsRef.current = params;
  }, []);

  // Typewriter animation loop
  useEffect(() => {
    if (prompt.length > 0) return; // Pause animation when user has typed something

    const currentExample = EXAMPLE_PROMPTS[exampleIndex];
    let timeoutId: NodeJS.Timeout;

    if (phase === "typing") {
      if (typedText.length < currentExample.length) {
        timeoutId = setTimeout(() => {
          setTypedText(currentExample.slice(0, typedText.length + 1));
        }, TYPE_SPEED_MS);
      } else {
        timeoutId = setTimeout(() => setPhase("holding"), 0);
      }
    } else if (phase === "holding") {
      timeoutId = setTimeout(() => setPhase("erasing"), HOLD_AFTER_TYPE_MS);
    } else if (phase === "erasing") {
      if (typedText.length > 0) {
        timeoutId = setTimeout(() => {
          setTypedText(typedText.slice(0, -1));
        }, ERASE_SPEED_MS);
      } else {
        timeoutId = setTimeout(() => setPhase("waiting"), 0);
      }
    } else if (phase === "waiting") {
      timeoutId = setTimeout(() => {
        setExampleIndex((i) => (i + 1) % EXAMPLE_PROMPTS.length);
        setPhase("typing");
      }, HOLD_AFTER_ERASE_MS);
    }

    return () => clearTimeout(timeoutId);
  }, [typedText, phase, exampleIndex, prompt.length]);

  function validate(): boolean {
    const trimmed = prompt.trim();
    if (trimmed.length < 10) {
      setError("Tell us a bit about your business and what you'd like your AI to do.");
      return false;
    }
    setError(null);
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    const leadEventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (window.fbq) {
      window.fbq("track", "Lead", {
        content_category: "Local Business",
      }, { eventID: leadEventId });
    }

    setIsLoading(true);

    try {
      const [response] = await Promise.all([
        fetch("/api/create-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt.trim() }),
        }),
        fetch(
          "https://script.google.com/macros/s/AKfycby_-ET6bfJfjPgmO-zPCiUCEemfG8IU7uajj46NQvKaeMuZWzYaFY9BXlK5hAAlAwIB/exec",
          {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              businessDescription: prompt.trim(),
              route: pathname,
              ...utmParamsRef.current,
            }),
          }
        ).catch(() => {}),
        fetch("/api/meta-lead-conversion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: leadEventId }),
        }).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, MINIMUM_LOADING_TIME)),
      ]);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "We hit a snag building your receptionist. Please try again."
        );
      }

      const data = await response.json();
      const demoBase =
        pathname === "/1"
          ? "/1/demo"
          : pathname === "/2"
          ? "/2/demo"
          : pathname === "/3"
          ? "/3/demo"
          : pathname === "/19"
          ? "/19/demo"
          : pathname === "/29"
          ? "/29/demo"
          : pathname === "/49"
          ? "/49/demo"
          : "/demo";
      router.push(
        `${demoBase}?assistantId=${data.assistantId}&businessName=${encodeURIComponent(data.businessName)}`
      );
    } catch (err) {
      setIsLoading(false);
      setApiError(
        err instanceof Error
          ? err.message
          : "We hit a snag building your receptionist. Please try again."
      );
    }
  }

  const showTypewriter = prompt.length === 0;

  return (
    <>
      <LoadingOverlay isVisible={isLoading} />

      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl">
        <div className="prompt-card relative">
          {/* Placeholder overlay (only visible when empty) */}
          {showTypewriter && (
            <div className="pointer-events-none absolute inset-x-0 top-0 px-6 pt-6 text-left">
              <p className="font-sans text-base leading-relaxed text-subtle md:text-lg">
                <em className="italic text-zinc-500">Example prompt:</em>{" "}
                {typedText}
                <span className="typewriter-caret" style={{ height: "1.1em", verticalAlign: "text-bottom" }} />
              </p>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (error) setError(null);
            }}
            rows={4}
            className="relative w-full resize-none bg-transparent px-6 pt-6 pb-4 font-sans text-base leading-relaxed text-foreground placeholder:text-transparent focus:outline-none md:text-lg"
            placeholder=" "
            autoComplete="off"
            spellCheck={true}
          />

          <div className="flex items-center justify-center gap-3 px-4 pb-4 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 font-sans text-sm font-medium text-background transition-all duration-200 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Live Demo Now
              <svg
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-center text-sm text-red-500 font-sans">{error}</p>
        )}
        {apiError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-600 font-sans">{apiError}</p>
          </div>
        )}
      </form>
    </>
  );
}
