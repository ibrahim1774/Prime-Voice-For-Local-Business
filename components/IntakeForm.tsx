"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import LoadingOverlay from "./LoadingOverlay";

const INDUSTRIES = [
  "Salon",
  "Auto Repair",
  "Gym",
  "Day Spa",
  "Law Firm",
  "Accounting",
  "Real Estate",
  "Photography",
];

interface FormData {
  businessName: string;
  phoneNumber: string;
  industry: string;
  voiceGender: "female" | "male";
}

interface FormErrors {
  businessName?: string;
  phoneNumber?: string;
  industry?: string;
}

const MINIMUM_LOADING_TIME = 4500;

export default function IntakeForm() {
  const router = useRouter();
  const pathname = usePathname();
  const [formData, setFormData] = useState<FormData>({
    businessName: "",
    phoneNumber: "",
    industry: "",
    voiceGender: "female",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % INDUSTRIES.length);
    }, 2500);
    return () => clearInterval(interval);
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

    if (!formData.industry.trim()) {
      newErrors.industry = "Please enter your industry";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    setIsLoading(true);

    try {
      const [response] = await Promise.all([
        fetch("/api/create-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }),
        fetch("https://hook.us2.make.com/1ijk41d5vdixvoedkr13qliymoyv2x2w", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessName: formData.businessName,
            phoneNumber: formData.phoneNumber,
            industry: formData.industry,
            voiceGender: formData.voiceGender,
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

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  const inputClasses =
    "w-full rounded-xl border border-white/[0.07] bg-charcoal/70 backdrop-blur-sm px-4 py-3 font-sans text-sm text-white placeholder:text-subtle focus:border-gold/40 focus:ring-1 focus:ring-gold/30 focus:bg-charcoal/90 transition-all duration-300";

  return (
    <>
      <LoadingOverlay isVisible={isLoading} />

      <div className="gold-glow-border mx-auto max-w-lg rounded-2xl p-5 md:p-8 transition-all duration-500">
        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4 text-left">
          {/* 1. Business Name */}
          <div>
            <input
              type="text"
              name="businessName"
              placeholder="Business Name"
              value={formData.businessName}
              onChange={handleChange}
              className={inputClasses}
              autoComplete="organization"
            />
            {errors.businessName && (
              <p className="mt-1.5 text-sm text-red-400 font-sans">
                {errors.businessName}
              </p>
            )}
          </div>

          {/* 2. Phone Number */}
          <div>
            <input
              type="tel"
              name="phoneNumber"
              placeholder="Phone Number"
              value={formData.phoneNumber}
              onChange={handleChange}
              className={inputClasses}
              autoComplete="tel"
            />
            {errors.phoneNumber && (
              <p className="mt-1.5 text-sm text-red-400 font-sans">
                {errors.phoneNumber}
              </p>
            )}
          </div>

          {/* 3. Industry (cycling placeholder) */}
          <div>
            <input
              type="text"
              name="industry"
              placeholder={INDUSTRIES[placeholderIndex]}
              value={formData.industry}
              onChange={handleChange}
              className={inputClasses}
              autoComplete="off"
            />
            {errors.industry && (
              <p className="mt-1.5 text-sm text-red-400 font-sans">
                {errors.industry}
              </p>
            )}
          </div>

          {/* 4. Voice Gender Toggle */}
          <div>
            <label className="block mb-1.5 text-xs font-sans text-muted">
              Receptionist Voice
            </label>
            <div className="flex rounded-xl overflow-hidden border border-white/[0.07]">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, voiceGender: "female" }))}
                className={`flex-1 py-2.5 font-sans text-sm font-medium transition-all duration-300 ${
                  formData.voiceGender === "female"
                    ? "bg-gold text-background"
                    : "bg-charcoal/70 text-subtle hover:text-white"
                }`}
              >
                Female
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, voiceGender: "male" }))}
                className={`flex-1 py-2.5 font-sans text-sm font-medium transition-all duration-300 ${
                  formData.voiceGender === "male"
                    ? "bg-gold text-background"
                    : "bg-charcoal/70 text-subtle hover:text-white"
                }`}
              >
                Male
              </button>
            </div>
          </div>

          {apiError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400 font-sans">{apiError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-gold px-6 py-3.5 font-sans text-sm font-semibold text-background transition-all duration-300 hover:bg-gold-light hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            HEAR MY LIVE DEMO &rarr;
          </button>

          <p className="text-center font-sans text-xs text-subtle pt-1">
            Free. No commitment. Just listen.
          </p>
        </form>
      </div>
    </>
  );
}
