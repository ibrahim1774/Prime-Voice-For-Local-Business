"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import LoadingOverlay from "./LoadingOverlay";

type Industry =
  | ""
  | "Home Services"
  | "Healthcare & Dental"
  | "Food & Restaurant"
  | "Beauty & Grooming"
  | "Fitness & Wellness"
  | "Automotive"
  | "Professional Services"
  | "Pet Services"
  | "Education & Tutoring"
  | "Real Estate"
  | "Events & Entertainment"
  | "Other";

interface FormData {
  industry: Industry;
  specialty: string;
  businessName: string;
  phoneNumber: string;
  customInstructions: string;
}

interface FormErrors {
  industry?: string;
  specialty?: string;
  businessName?: string;
  phoneNumber?: string;
}

const INDUSTRY_OPTIONS: Industry[] = [
  "Home Services",
  "Healthcare & Dental",
  "Food & Restaurant",
  "Beauty & Grooming",
  "Fitness & Wellness",
  "Automotive",
  "Professional Services",
  "Pet Services",
  "Education & Tutoring",
  "Real Estate",
  "Events & Entertainment",
  "Other",
];

const SPECIALTY_PLACEHOLDERS: Record<string, string> = {
  "Home Services": "e.g. Plumber, Electrician, Roofer, HVAC Tech",
  "Healthcare & Dental": "e.g. General Dentist, Orthodontist, Chiropractor, Physical Therapist",
  "Food & Restaurant": "e.g. Italian Restaurant, Sushi Bar, Catering Company, Bakery",
  "Beauty & Grooming": "e.g. Barbershop, Hair Salon, Nail Studio, Med Spa",
  "Fitness & Wellness": "e.g. Personal Trainer, Yoga Studio, CrossFit Gym, Massage Therapy",
  "Automotive": "e.g. Auto Repair, Detailing, Tire Shop, Body Shop",
  "Professional Services": "e.g. Family Law Attorney, CPA, Business Consultant",
  "Pet Services": "e.g. Dog Groomer, Veterinarian, Pet Boarding, Dog Walker",
  "Education & Tutoring": "e.g. Math Tutor, Music Lessons, SAT Prep, Language School",
  "Real Estate": "e.g. Residential Agent, Property Manager, Commercial Broker",
  "Events & Entertainment": "e.g. Wedding Planner, DJ, Photographer, Venue",
  "Other": "Describe your specific service",
};

const SUGGESTION_CHIPS = [
  "Book more appointments",
  "Capture leads when I can't answer",
  "Provide 24/7 coverage",
  "Mention current deals or promotions",
  "Screen calls before transferring",
  "Handle after-hours calls differently",
];

const MINIMUM_LOADING_TIME = 4500;

export default function IntakeForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    industry: "",
    specialty: "",
    businessName: "",
    phoneNumber: "",
    customInstructions: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [clickedChips, setClickedChips] = useState<Set<string>>(new Set());

  function validate(): boolean {
    const newErrors: FormErrors = {};

    if (!formData.industry) {
      newErrors.industry = "Please select your industry";
    }

    if (!formData.specialty.trim()) {
      newErrors.specialty = "Please enter your specialty";
    }

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
            industry: formData.industry,
            specialty: formData.specialty,
            businessName: formData.businessName,
            phoneNumber: formData.phoneNumber,
            customInstructions: formData.customInstructions,
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  function handleChipClick(chipText: string) {
    if (clickedChips.has(chipText)) return;
    setClickedChips((prev) => new Set(prev).add(chipText));
    setFormData((prev) => ({
      ...prev,
      customInstructions: prev.customInstructions
        ? prev.customInstructions + "\n" + chipText
        : chipText,
    }));
  }

  const inputClasses =
    "w-full rounded-xl border border-white/[0.07] bg-charcoal/70 backdrop-blur-sm px-4 py-3 font-sans text-sm text-white placeholder:text-subtle focus:border-gold/40 focus:ring-1 focus:ring-gold/30 focus:bg-charcoal/90 transition-all duration-300";

  return (
    <>
      <LoadingOverlay isVisible={isLoading} />

      <div className="gold-glow-border mx-auto max-w-lg rounded-2xl p-5 md:p-8 transition-all duration-500">
        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4 text-left">
          {/* 1. Industry dropdown */}
          <div>
            <select
              name="industry"
              value={formData.industry}
              onChange={handleChange}
              className={inputClasses + " appearance-none cursor-pointer"}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23737373' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 1rem center",
                backgroundSize: "1.25rem",
              }}
            >
              <option value="" disabled>Select Your Industry</option>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {errors.industry && (
              <p className="mt-1.5 text-sm text-red-400 font-sans">
                {errors.industry}
              </p>
            )}
          </div>

          {/* 2. Specialty text input */}
          <div>
            <input
              type="text"
              name="specialty"
              placeholder={
                formData.industry
                  ? SPECIALTY_PLACEHOLDERS[formData.industry] || "Your specialty"
                  : "First select your industry above"
              }
              value={formData.specialty}
              onChange={handleChange}
              className={inputClasses}
              autoComplete="off"
            />
            {errors.specialty && (
              <p className="mt-1.5 text-sm text-red-400 font-sans">
                {errors.specialty}
              </p>
            )}
          </div>

          {/* 3. Business Name */}
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

          {/* 4. Phone Number */}
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

          {/* 5. Custom Instructions (optional) */}
          <div>
            <label className="block mb-1 text-xs font-sans text-muted">
              Custom instructions (optional)
            </label>
            <textarea
              name="customInstructions"
              placeholder={"e.g. Capture name, number & what they need. Mention 15% off drain cleaning this month."}
              value={formData.customInstructions}
              onChange={handleChange}
              rows={2}
              className={inputClasses + " resize-none"}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className={`rounded-full border px-2.5 py-1 font-sans text-[11px] transition-all duration-200 ${
                    clickedChips.has(chip)
                      ? "border-gold/10 bg-gold/5 text-subtle cursor-default opacity-50"
                      : "border-gold/20 bg-gold/10 text-gold hover:bg-gold/20 hover:border-gold/30 cursor-pointer"
                  }`}
                >
                  {chip}
                </button>
              ))}
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
            Generate My AI Receptionist
          </button>
        </form>
      </div>
    </>
  );
}
