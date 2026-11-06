import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";

function slugifySchoolName(value: string): string {
  const map: Record<string, string> = {
    "\u0627": "a", "\u0623": "a", "\u0625": "i", "\u0622": "a", "\u0628": "b", "\u062A": "t", "\u062B": "th", "\u062C": "j",
    "\u062D": "h", "\u062E": "kh", "\u062F": "d", "\u0630": "dh", "\u0631": "r", "\u0632": "z", "\u0633": "s", "\u0634": "sh",
    "\u0635": "s", "\u0636": "d", "\u0637": "t", "\u0638": "z", "\u0639": "a", "\u063A": "gh", "\u0641": "f", "\u0642": "q",
    "\u0643": "k", "\u0644": "l", "\u0645": "m", "\u0646": "n", "\u0647": "h", "\u0648": "w", "\u064A": "y", "\u0649": "a",
    "\u0629": "h", "\u0621": "", "\u0626": "y", "\u0624": "w",
  };
  const normalized = value.normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "");
  return [...normalized].map(char => map[char] ?? char).join("")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export default function SchoolRegistration() {
  const { user, session } = useAuth();
  const { locale, direction } = useLocale();
  const ar = locale === "ar";
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [requestStatus, setRequestStatus] = useState<{status:string; school_name:string; review_note:string|null} | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("quranos-school-registration-draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setName(String(draft.name ?? ""));
        setEmail(String(draft.email ?? ""));
        setSchool(String(draft.school ?? ""));
        setSlug(String(draft.slug ?? ""));
        setSlugEdited(Boolean(draft.slug));
        setPhone(String(draft.phone ?? ""));
        setAddress(String(draft.address ?? ""));
        setNote(String(draft.note ?? ""));
      } catch { localStorage.removeItem("quranos-school-registration-draft"); }
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void getSupabaseClient().from("school_registration_requests")
      .select("status,school_name,review_note")
      .eq("applicant_profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setRequestStatus(data); });
    return () => { cancelled = true; };
  }, [user?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const client = getSupabaseClient();
    try {
      if (!session) {
        localStorage.setItem("quranos-school-registration-draft", JSON.stringify({name, email, school, slug, phone, address, note}));
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
      localStorage.removeItem("quranos-school-registration-draft");
      setRequestStatus({ status: "pending", school_name: school, review_note: null });
      setMessage(ar ? "تم إرسال طلبك. سيظهر هنا بعد المراجعة." : "Application submitted. It will appear here after review.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر إرسال الطلب." : "Could not submit application."));
    } finally { setBusy(false); }
  };

  return <main dir={direction} className="min-h-screen bg-[#F6F8F5] p-4 py-10 text-[#173B2D]">
    <section className="mx-auto max-w-xl rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">{ar ? "تسجيل مدرسة جديدة" : "Register a school"}</h1>
      <p className="mt-2 text-sm leading-7 text-slate-600">{ar ? "أنشئ حساب المسؤول أو سجّل الدخول بحسابك الحالي، ثم أرسل طلب مدرستك. لن تُفعّل المدرسة قبل موافقة مالك المنصة." : "Create an administrator account or sign in with your existing account, then submit your school. The platform owner must approve it before activation."}</p>
      {requestStatus?.status === "pending" && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>{ar ? "طلبك قيد المراجعة" : "Application pending"}</strong><p className="mt-1">{requestStatus.school_name}</p></div>}
      {requestStatus?.status === "approved" && <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"><strong>{ar ? "تمت الموافقة على طلبك" : "Application approved"}</strong><p className="mt-1">{ar ? "سجّل الدخول مجددًا لفتح لوحة المدرسة." : "Sign in again to open the school dashboard."}</p></div>}
      {requestStatus?.status === "rejected" && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><strong>{ar ? "تم رفض الطلب السابق" : "Previous application rejected"}</strong><p className="mt-1">{requestStatus.review_note ?? ""}</p></div>}
      {requestStatus?.status !== "pending" && requestStatus?.status !== "approved" && <form onSubmit={submit} className="mt-5 grid gap-3">
        <label className="text-sm font-semibold">{ar ? "اسم المسؤول" : "Administrator name"}<input required minLength={2} value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "البريد الإلكتروني" : "Email"}<input required type="email" disabled={Boolean(session)} value={session?.user.email ?? email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        {!session && <label className="text-sm font-semibold">{ar ? "كلمة المرور (8 أحرف على الأقل)" : "Password (at least 8 characters)"}<input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>}
        <label className="text-sm font-semibold">{ar ? "اسم المدرسة" : "School name"}<input required minLength={2} value={school} onChange={e=>{const value=e.target.value;setSchool(value);if(!slugEdited)setSlug(slugifySchoolName(value));}} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "الرابط المختصر (بالأحرف اللاتينية)" : "School URL slug (Latin letters)"}<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={e=>{setSlugEdited(true);setSlug(e.target.value.toLowerCase());}} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "الهاتف" : "Phone"}<input value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "العنوان" : "Address"}<input value={address} onChange={e=>setAddress(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">{ar ? "ملاحظات" : "Notes"}<textarea value={note} onChange={e=>setNote(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border p-3"/></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        <button disabled={busy} className="rounded-xl bg-[#17663B] p-3 font-bold text-white disabled:opacity-50">{busy ? (ar ? "جارٍ الإرسال..." : "Submitting...") : (ar ? "إرسال الطلب" : "Submit application")}</button>
      </form>}
      <p className="mt-4 text-center text-sm"><Link className="text-[#17663B] underline" href="/login">{ar ? "لديك حساب؟ تسجيل الدخول" : "Already have an account? Sign in"}</Link></p>
    </section>
  </main>;
}
