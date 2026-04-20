"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import LoadingOverlay from "./LoadingOverlay";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

interface FormData {
  businessName: string;
  phoneNumber: string;
  voiceGender: "female" | "male";
}

interface FormErrors {
  businessName?: string;
  phoneNumber?: string;
}

const MINIMUM_LOADING_TIME = 4500;

export default function IntakeForm() {
  const router = useRouter();
  const pathname = usePathname();
  const [formData, setFormData] = useState<FormData>({
    businessName: "",
    phoneNumber: "",
    voiceGender: "female",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

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

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!formData.businessName.trim()) {
      newErrors.businessName = "Business name is required";
    }
    const phoneDigits = formData.phoneNumber.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      newErrors.phoneNumber = "Enter a valid phone number";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    const leadEventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (window.fbq) {
      window.fbq("track", "Lead", {
        content_name: formData.businessName,
        content_category: "Local Business",
      }, { eventID: leadEventId });
    }

    setIsLoading(true);

    try {
      const [response] = await Promise.all([
        fetch("/api/create-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }),
        fetch(
          "https://script.google.com/macros/s/AKfycby_-ET6bfJfjPgmO-zPCiUCEemfG8IU7uajj46NQvKaeMuZWzYaFY9BXlK5hAAlAwIB/exec",
          {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              businessName: formData.businessName,
              phoneNumber: formData.phoneNumber,
              voiceGender: formData.voiceGender,
              route: pathname,
              ...utmParamsRef.current,
            }),
          }
        ).catch(() => {}),
        fetch("/api/meta-lead-conversion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber: formData.phoneNumber,
            eventId: leadEventId,
          }),
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

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  const inputClasses =
    "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 font-sans text-base text-foreground placeholder:text-subtle focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 transition-all duration-200";

  return (
    <>
      <LoadingOverlay isVisible={isLoading} />

      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-lg">
        <div className="prompt-card p-6 md:p-7">
          <div className="space-y-4 text-left">
            {/* Business Name */}
            <div>
              <input
                type="text"
                name="businessName"
                placeholder="Your Business Name"
                value={formData.businessName}
                onChange={handleChange}
                className={inputClasses}
                autoComplete="organization"
              />
              {errors.businessName && (
                <p className="mt-1.5 text-sm text-red-500 font-sans">
                  {errors.businessName}
                </p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <input
                type="tel"
                name="phoneNumber"
                placeholder="Your Phone Number"
                value={formData.phoneNumber}
                onChange={handleChange}
                className={inputClasses}
                autoComplete="tel"
              />
              {errors.phoneNumber && (
                <p className="mt-1.5 text-sm text-red-500 font-sans">
                  {errors.phoneNumber}
                </p>
              )}
            </div>

            {/* Voice Gender Toggle */}
            <div>
              <p className="mb-2 font-sans text-xs font-medium uppercase tracking-wider text-subtle">
                Voice
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, voiceGender: "female" }))}
                  className={`flex-1 rounded-lg py-2.5 font-sans text-sm font-medium transition-all duration-200 ${
                    formData.voiceGender === "female"
                      ? "bg-foreground text-background"
                      : "border border-zinc-200 bg-white text-muted hover:text-foreground"
                  }`}
                >
                  Female
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, voiceGender: "male" }))}
                  className={`flex-1 rounded-lg py-2.5 font-sans text-sm font-medium transition-all duration-200 ${
                    formData.voiceGender === "male"
                      ? "bg-foreground text-background"
                      : "border border-zinc-200 bg-white text-muted hover:text-foreground"
                  }`}
                >
                  Male
                </button>
              </div>
            </div>

            {apiError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-600 font-sans">{apiError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="group mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3.5 font-sans text-sm font-semibold text-background transition-all duration-200 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Live Demo
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
      </form>
    </>
  );
}
