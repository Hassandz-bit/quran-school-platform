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
  tall?: boolean;
};

function WritingField({ label, required = false, optionalText, className = "", tall = false }: WritingFieldProps) {
  return (
    <div className={`registration-field ${className}`}>
      <div className="flex items-baseline justify-between gap-2 text-[11px] font-semibold text-slate-700">
        <span>{label}{required && <span className="ms-1 text-red-700">*</span>}</span>
        {!required && <span className="text-[9px] font-normal text-slate-400">{optionalText}</span>}
      </div>
      <div className={`registration-writing-line ${tall ? "registration-writing-line-tall" : ""}`} />
    </div>
  );
}

function CheckOption({ label, attached, notAttached }: { label: string; attached: string; notAttached: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dotted border-slate-300 py-2 text-[11px]">
      <span>{label}</span>
      <span className="flex shrink-0 items-center gap-3 text-[10px] text-slate-600">
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
        .registration-sheet { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto 24px; padding: 13mm; background: #fff; box-shadow: 0 12px 36px rgba(15, 23, 42, .12); color: #17211d; font-family: "Cairo", sans-serif; }
        .registration-sheet * { box-sizing: border-box; }
        .registration-writing-line { min-height: 8mm; border-bottom: 1px solid #64748b; }
        .registration-writing-line-tall { min-height: 14mm; }
        .registration-checkbox { display: inline-block; width: 4mm; height: 4mm; border: 1px solid #334155; border-radius: 1px; }
        .registration-section { break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; }
        .registration-section-title { border-inline-start: 4px solid #0b4738; background: #eff7f3; padding: 7px 10px; color: #0b4738; font-weight: 800; }
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body, #root { width: 100%; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .print-registration-view, .print-registration-view * { visibility: visible !important; }
          .print-registration-view { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .print-registration-actions { display: none !important; }
          .registration-sheet { width: 100% !important; height: 277mm !important; min-height: 277mm !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: 0 !important; overflow: hidden !important; break-after: page; page-break-after: always; }
          .registration-sheet:last-of-type { break-after: auto; page-break-after: auto; }
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
        <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-[#0B4738] pb-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold text-[#0B4738]">{copy.school}: {school?.name || copy.schoolPlaceholder}</p>
            <h1 className="text-xl font-black text-[#173B2D]">{copy.title}</h1>
            <p className="mt-1 max-w-[125mm] text-[10px] leading-5 text-slate-600">{copy.subtitle}</p>
          </div>
          <div className="w-[36mm] shrink-0 space-y-2 text-[9px] text-slate-600">
            <div>{copy.formNumber}<div className="registration-writing-line !min-h-[6mm]" /></div>
            <div>{copy.applicationDate}<div className="registration-writing-line !min-h-[6mm]" /></div>
          </div>
        </header>

        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] text-amber-950">{copy.requiredNote}</p>
        <section className="registration-section">
          <div className="registration-section-title mb-3 text-sm">{copy.studentSection}</div>
          <p className="mb-3 text-[10px] text-slate-500">{copy.studentInstruction}</p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2">
            <WritingField label={copy.firstName} required optionalText={copy.optional} />
            <WritingField label={copy.lastName} required optionalText={copy.optional} />
            <WritingField label={copy.birthDate} required optionalText={copy.optional} />
            <div className="registration-field">
              <div className="text-[11px] font-semibold text-slate-700">{copy.gender}<span className="ms-1 text-red-700">*</span></div>
              <div className="registration-writing-line flex items-center gap-6 text-[11px]">
                <span className="flex items-center gap-2"><span className="registration-checkbox" />{copy.male}</span>
                <span className="flex items-center gap-2"><span className="registration-checkbox" />{copy.female}</span>
              </div>
            </div>
            <WritingField label={copy.nationalId} optionalText={copy.optional} />
            <WritingField label={copy.studentPhone} optionalText={copy.optional} />
            <WritingField label={copy.studentEmail} optionalText={copy.optional} />
            <WritingField label={copy.previousSchool} optionalText={copy.optional} />
            <WritingField label={copy.address} optionalText={copy.optional} className="col-span-2" tall />
            <WritingField label={copy.educationStage} optionalText={copy.optional} />
            <WritingField label={copy.educationYear} optionalText={copy.optional} />
          </div>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-6">
          <WritingField label={copy.studentSignature} optionalText={copy.optional} />
          <WritingField label={copy.applicationDate} optionalText={copy.optional} />
        </div>
        <footer className="mt-6 flex items-center justify-between border-t border-slate-200 pt-2 text-[9px] text-slate-500">
          <span>{copy.privacyNote}</span><span className="shrink-0 ps-3">{copy.pageOne}</span>
        </footer>
      </section>

      <section className="registration-sheet" aria-label={copy.pageTwo}>
        <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-[#0B4738] pb-3">
          <div>
            <p className="mb-1 text-xs font-bold text-[#0B4738]">{copy.school}: {school?.name || copy.schoolPlaceholder}</p>
            <h2 className="text-lg font-black text-[#173B2D]">{copy.guardianSection}</h2>
            <p className="mt-1 text-[10px] text-slate-600">{copy.guardianInstruction}</p>
          </div>
          <span className="shrink-0 rounded-full border border-[#C8A26A] px-3 py-1 text-[9px] font-bold text-[#805B21]">{copy.pageTwo}</span>
        </header>

        <section className="registration-section mb-3">
          <div className="registration-section-title mb-2 text-sm">{copy.guardianSection}</div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1">
            <WritingField label={copy.guardianName} required optionalText={copy.optional} />
            <WritingField label={copy.guardianRelation} required optionalText={copy.optional} />
            <WritingField label={copy.guardianPhone} required optionalText={copy.optional} />
            <WritingField label={copy.guardianEmail} optionalText={copy.optional} />
            <WritingField label={copy.guardianJob} optionalText={copy.optional} className="col-span-2" />
          </div>
        </section>

        <section className="registration-section mb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-800">{copy.additionalGuardian}</h3>
            <p className="text-[9px] text-slate-500">{copy.additionalGuardianNote}</p>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-5 gap-y-1">
            <WritingField label={copy.additionalGuardianName} optionalText={copy.optional} />
            <WritingField label={copy.additionalGuardianRelation} optionalText={copy.optional} />
            <WritingField label={copy.additionalGuardianPhone} optionalText={copy.optional} />
            <WritingField label={copy.guardianEmail} optionalText={copy.optional} />
          </div>
        </section>

        <section className="registration-section mb-3">
          <div className="registration-section-title mb-2 text-xs">{copy.admissionSection}</div>
          <div className="grid grid-cols-3 gap-x-5 gap-y-1">
            <WritingField label={copy.branch} required optionalText={copy.optional} />
            <WritingField label={copy.className} optionalText={copy.optional} />
            <WritingField label={copy.startDate} required optionalText={copy.optional} />
          </div>
        </section>

        <section className="registration-section mb-3">
          <div className="registration-section-title mb-1 text-xs">{copy.documentsSection}</div>
          <div className="grid grid-cols-2 gap-x-6">
            <CheckOption label={copy.birthCertificate} attached={copy.attached} notAttached={copy.notAttached} />
            <CheckOption label={copy.personalPhotos} attached={copy.attached} notAttached={copy.notAttached} />
            <CheckOption label={copy.medicalReport} attached={copy.attached} notAttached={copy.notAttached} />
            <CheckOption label={copy.previousCertificate} attached={copy.attached} notAttached={copy.notAttached} />
          </div>
        </section>

        <section className="registration-section mb-3">
          <p className="text-[10px] leading-5 text-slate-700">{copy.guardianDeclaration}</p>
          <div className="mt-2 grid grid-cols-2 gap-6">
            <WritingField label={copy.guardianSignature} required optionalText={copy.optional} />
            <WritingField label={copy.receivedDate} required optionalText={copy.optional} />
          </div>
        </section>

        <section className="registration-section">
          <h3 className="mb-2 text-xs font-bold text-[#0B4738]">{copy.admissionSection}</h3>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1">
            <WritingField label={copy.enteredBy} optionalText={copy.optional} />
            <WritingField label={copy.studentNumber} optionalText={copy.optional} />
            <WritingField label={copy.officeNotes} optionalText={copy.optional} className="col-span-2" tall />
          </div>
        </section>
        <footer className="mt-3 border-t border-slate-200 pt-2 text-[9px] text-slate-500">{copy.privacyNote}</footer>
      </section>
    </main>
  );
}
