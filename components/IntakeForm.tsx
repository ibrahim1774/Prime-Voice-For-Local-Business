"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import LoadingOverlay from "./LoadingOverlay";

interface FormData {
  businessName: string;
  phoneNumber: string;
  businessDescription: string;
}

interface FormErrors {
  businessName?: string;
  phoneNumber?: string;
  businessDescription?: string;
}

const MINIMUM_LOADING_TIME = 4500;

export default function IntakeForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    businessName: "",
    phoneNumber: "",
    businessDescription: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  function validate(): boolean {
    const newErrors: FormErrors = {};

    if (!formData.businessName.trim()) {
      newErrors.businessName = "Business name is required";
    }

    const phoneDigits = formData.phoneNumber.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      newErrors.phoneNumber = "Enter a valid phone number";
    }

    if (!formData.businessDescription.trim()) {
      newErrors.businessDescription = "Tell us what your business does";
    } else if (formData.businessDescription.trim().length < 20) {
      newErrors.businessDescription = "Please provide a bit more detail (20+ characters)";
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
        new Promise((resolve) => setTimeout(resolve, MINIMUM_LOADING_TIME)),
      ]);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "We hit a snag building your receptionist. Please try again."
        );
      }

      const data = await response.json();
      router.push(
        `/demo?assistantId=${data.assistantId}&businessName=${encodeURIComponent(data.businessName)}`
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  const inputClasses =
    "w-full rounded-xl border border-white/10 bg-charcoal px-5 py-4 font-sans text-white placeholder:text-subtle focus:border-gold/50 focus:ring-1 focus:ring-gold/50 transition-all duration-300";

  return (
    <>
      <LoadingOverlay isVisible={isLoading} />

      <div className="gold-glow-border mx-auto max-w-lg rounded-2xl bg-card/80 backdrop-blur-sm p-8 transition-all duration-500">
        <form onSubmit={handleSubmit} className="space-y-5 text-left">
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

          <div>
            <textarea
              name="businessDescription"
              placeholder="Type in here: What does your business do? (e.g., residential plumbing, HVAC repair, roofing, etc.)"
              value={formData.businessDescription}
              onChange={handleChange}
              rows={3}
              className={inputClasses + " resize-none"}
            />
            {errors.businessDescription && (
              <p className="mt-1.5 text-sm text-red-400 font-sans">
                {errors.businessDescription}
              </p>
            )}
          </div>

          {apiError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400 font-sans">{apiError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-gold px-6 py-4 font-sans text-base font-semibold text-background transition-all duration-300 hover:bg-gold-light hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 animate-pulse-glow"
          >
            Build My AI Receptionist
          </button>

          <p className="text-center text-xs text-subtle font-sans">
            No credit card required. Takes less than 60 seconds.
          </p>
        </form>
      </div>
    </>
  );
}
