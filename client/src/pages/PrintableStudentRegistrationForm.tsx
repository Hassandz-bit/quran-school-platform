import React from "react";
import { ArrowLeft, ArrowRight, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { printableRegistrationFormCopy } from "@/lib/printable-registration-form-copy";

type WritingFieldProps = {
  label: string;
  required?: boolean;
  optionalText: string;
  className?: string;
  compact?: boolean;
};

function WritingField({ label, required = false, optionalText, className = "", compact = false }: WritingFieldProps) {
  return (
    <div className={`registration-field min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-1 text-[10px] font-semibold text-slate-700">
        <span>{label}{required && <span className="ms-1 text-red-700">*</span>}</span>
        {!required && <span className="text-[8px] font-normal text-slate-400">{optionalText}</span>}
      </div>
      <div className={`registration-writing-line ${compact ? "registration-writing-line-compact" : ""}`} />
    </div>
  );
}

function CheckOption({ label, attached, notAttached }: { label: string; attached: string; notAttached: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dotted border-slate-300 py-1 text-[9px]">
      <span>{label}</span>
      <span className="flex shrink-0 items-center gap-2 text-[8px] text-slate-600">
        <span className="flex items-center gap-1"><span className="registration-checkbox" />{attached}</span>
        <span className="flex items-center gap-1"><span className="registration-checkbox" />{notAttached}</span>
      </span>
    </div>
  );
}

export default function PrintableStudentRegistrationForm() {
  const { locale, direction } = useLocale();
  const copy = printableRegistrationFormCopy[locale];
  const { school } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <main className="print-registration-view min-h-screen bg-slate-100 px-4 py-6 text-slate-900" dir={direction}>
      <style>{`
        .registration-sheet { box-sizing: border-box; width: 210mm; height: 297mm; margin: 0 auto 24px; padding: 9mm; background: #fff; box-shadow: 0 12px 36px rgba(15, 23, 42, .12); color: #17211d; font-family: "Cairo", sans-serif; overflow: hidden; }
        .registration-sheet * { box-sizing: border-box; }
        .registration-writing-line { min-height: 6mm; border-bottom: 1px solid #94a3b8; }
        .registration-writing-line-compact { min-height: 5mm; }
        .registration-checkbox { display: inline-block; width: 3.5mm; height: 3.5mm; border: 1px solid #334155; border-radius: 1px; }
        .registration-section { break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; }
        .registration-section-title { border-inline-start: 3px solid #0b4738; background: #eff7f3; padding: 5px 8px; color: #0b4738; font-weight: 800; }
        @media print {
          @page { size: A4 portrait; margin: 7mm; }
          html, body, #root { width: 100%; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .print-registration-view, .print-registration-view * { visibility: visible !important; }
          .print-registration-view { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .print-registration-actions { display: none !important; }
          .registration-sheet { width: 100% !important; height: 283mm !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: 0 !important; overflow: hidden !important; break-after: auto !important; page-break-after: auto !important; }
          .registration-section { break-inside: avoid; }
        }
      `}</style>

      <div className="print-registration-actions mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="font-bold text-[#0B4738]">{copy.title}</p>
          <p className="mt-1 text-xs text-slate-500">{copy.printHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setLocation("/students/new")} className="gap-2">
            {direction === "rtl" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
            {copy.back}
          </Button>
          <Button type="button" onClick={() => window.print()} className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]">
            <Printer size={16} />{copy.print}
          </Button>
        </div>
      </div>

      <section className="registration-sheet" aria-label={copy.pageOne}>
        <header className="mb-2 flex items-start justify-between gap-3 border-b-2 border-[#0B4738] pb-2">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold text-[#0B4738]">{copy.school}: {school?.name || copy.schoolPlaceholder}</p>
            <h1 className="text-lg font-black leading-tight text-[#173B2D]">{copy.title}</h1>
            <p className="mt-1 text-[9px] leading-4 text-slate-600">{copy.subtitle}</p>
          </div>
          <div className="w-[32mm] shrink-0 space-y-1 text-[8px] text-slate-600">
            <div>{copy.formNumber}<div className="registration-writing-line registration-writing-line-compact" /></div>
            <div>{copy.applicationDate}<div className="registration-writing-line registration-writing-line-compact" /></div>
          </div>
        </header>

        <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[8px] text-amber-950">{copy.requiredNote}</p>

        <section className="registration-section mb-2">
          <div className="registration-section-title mb-2 text-xs">{copy.studentSection}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <WritingField label={copy.firstName} required optionalText={copy.optional} compact />
            <WritingField label={copy.lastName} required optionalText={copy.optional} compact />
            <WritingField label={copy.birthDate} required optionalText={copy.optional} compact />
            <div className="registration-field">
              <div className="text-[10px] font-semibold text-slate-700">{copy.gender}<span className="ms-1 text-red-700">*</span></div>
              <div className="registration-writing-line registration-writing-line-compact flex items-center gap-5 text-[10px]">
                <span className="flex items-center gap-1"><span className="registration-checkbox" />{copy.male}</span>
                <span className="flex items-center gap-1"><span className="registration-checkbox" />{copy.female}</span>
              </div>
            </div>
            <WritingField label={copy.previousSchool} optionalText={copy.optional} compact />
            <WritingField label={copy.educationStage} optionalText={copy.optional} compact />
            <WritingField label={copy.educationYear} optionalText={copy.optional} compact />
          </div>
        </section>

        <section className="registration-section mb-2">
          <div className="registration-section-title mb-2 text-xs">{copy.guardianSection}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <WritingField label={copy.guardianName} required optionalText={copy.optional} compact />
            <WritingField label={copy.guardianRelation} required optionalText={copy.optional} compact />
            <WritingField label={copy.guardianPhone} required optionalText={copy.optional} compact />
            <WritingField label={copy.guardianEmail} optionalText={copy.optional} compact />
            <WritingField label={copy.guardianJob} optionalText={copy.optional} compact />
            <WritingField label={copy.additionalGuardianName} optionalText={copy.optional} compact />
          </div>
        </section>

        <section className="registration-section mb-2">
          <div className="registration-section-title mb-1 text-xs">{copy.admissionSection}</div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            <WritingField label={copy.branch} required optionalText={copy.optional} compact />
            <WritingField label={copy.className} optionalText={copy.optional} compact />
            <WritingField label={copy.startDate} required optionalText={copy.optional} compact />
          </div>
        </section>

        <section className="registration-section mb-2">
          <div className="registration-section-title mb-1 text-xs">{copy.documentsSection}</div>
          <div className="grid grid-cols-2 gap-x-5">
            <CheckOption label={copy.birthCertificate} attached={copy.attached} notAttached={copy.notAttached} />
            <CheckOption label={copy.personalPhotos} attached={copy.attached} notAttached={copy.notAttached} />
            <CheckOption label={copy.medicalReport} attached={copy.attached} notAttached={copy.notAttached} />
            <CheckOption label={copy.previousCertificate} attached={copy.attached} notAttached={copy.notAttached} />
          </div>
        </section>

        <section className="registration-section mb-2">
          <p className="text-[9px] leading-4 text-slate-700">{copy.guardianDeclaration}</p>
          <div className="mt-1 grid grid-cols-2 gap-x-5">
            <WritingField label={copy.guardianSignature} required optionalText={copy.optional} compact />
            <WritingField label={copy.receivedDate} required optionalText={copy.optional} compact />
          </div>
        </section>

        <section className="registration-section mb-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <WritingField label={copy.enteredBy} optionalText={copy.optional} compact />
            <WritingField label={copy.studentNumber} optionalText={copy.optional} compact />
            <WritingField label={copy.officeNotes} optionalText={copy.optional} className="col-span-2" compact />
          </div>
        </section>

        <footer className="border-t border-slate-200 pt-1 text-[8px] leading-3 text-slate-500">{copy.privacyNote}</footer>
      </section>
    </main>
  );
}
