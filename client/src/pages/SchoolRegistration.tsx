import { useState } from "react";
import { Link } from "wouter";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";

export default function SchoolRegistration() {
  const { user, session } = useAuth();
  const { locale, direction } = useLocale();
  const ar = locale === "ar";
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const client = getSupabaseClient();
    try {
      if (!session) {
        const result = await client.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { emailRedirectTo: window.location.origin + "/school-registration" },
        });
        if (result.error) throw result.error;
        if (!result.data.session) {
          setMessage(ar ? "أُنشئ الحساب. أكّد بريدك الإلكتروني ثم سجّل الدخول وأعد إرسال طلب المدرسة." : "Account created. Confirm your email, sign in, then submit the school application.");
          return;
        }
      }
      const { error: rpcError } = await client.rpc("submit_school_registration_request", {
        target_full_name: name,
        target_school_name: school,
        target_slug: slug.toLowerCase(),
        target_contact_phone: phone || null,
        target_address: address || null,
        target_applicant_note: note || null,
        target_locale: locale,
      });
      if (rpcError) throw rpcError;
      setMessage(ar ? "تم إرسال طلبك. سيظهر هنا بعد المراجعة." : "Application submitted. It will appear here after review.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر إرسال الطلب." : "Could not submit application."));
    } finally { setBusy(false); }
  };

  return <main dir={direction} className="min-h-screen bg-[#F6F8F5] p-4 py-10 text-[#173B2D]">
    <section className="mx-auto max-w-xl rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">{ar ? "تسجيل مدرسة جديدة" : "Register a school"}</h1>
      <p className="mt-2 text-sm leading-7 text-slate-600">{ar ? "أنشئ حساب المسؤول وأرسل طلب مدرستك. لن تُفعّل المدرسة قبل موافقة مالك المنصة." : "Create the administrator account and submit your school. The platform owner must approve it before activation."}</p>
      <form onSubmit={submit} className="mt-5 grid gap-3">
        <label className="text-sm font-semibold">{ar ? "اسم المسؤول" : "Administrator name"}<input required minLength={2} value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "البريد الإلكتروني" : "Email"}<input required type="email" disabled={Boolean(session)} value={session?.user.email ?? email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        {!session && <label className="text-sm font-semibold">{ar ? "كلمة المرور (8 أحرف على الأقل)" : "Password (at least 8 characters)"}<input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>}
        <label className="text-sm font-semibold">{ar ? "اسم المدرسة" : "School name"}<input required minLength={2} value={school} onChange={e=>setSchool(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "الرابط المختصر (بالأحرف اللاتينية)" : "School URL slug (Latin letters)"}<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={e=>setSlug(e.target.value.toLowerCase())} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "الهاتف" : "Phone"}<input value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "العنوان" : "Address"}<input value={address} onChange={e=>setAddress(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "ملاحظات" : "Notes"}<textarea value={note} onChange={e=>setNote(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border p-3"/></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        <button disabled={busy} className="rounded-xl bg-[#17663B] p-3 font-bold text-white disabled:opacity-50">{busy ? (ar ? "جارٍ الإرسال..." : "Submitting...") : (ar ? "إرسال الطلب" : "Submit application")}</button>
      </form>
      <p className="mt-4 text-center text-sm"><Link className="text-[#17663B] underline" href="/login">{ar ? "لديك حساب؟ تسجيل الدخول" : "Already have an account? Sign in"}</Link></p>
    </section>
  </main>;
}
