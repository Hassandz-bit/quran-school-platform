import { useEffect, useState } from "react";
import { Download, Loader2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { prepareTeacherOfflineData, type OfflinePreparationProgress } from "@/lib/teacher-offline-preload";

export default function PrepareTeacherOffline() {
  const { user, school, activeRoleCodes } = useAuth();
  const [busy, setBusy] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? false : navigator.onLine);
  const [progress, setProgress] = useState<OfflinePreparationProgress | null>(null);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!activeRoleCodes.includes("teacher") || !user?.id || !school?.id) return null;

  const handlePrepare = async () => {
    if (busy || !isOnline) {
      toast.error("يلزم الاتصال بالإنترنت لتجهيز البيانات أول مرة.");
      return;
    }
    setBusy(true);
    setProgress(null);
    try {
      const result = await prepareTeacherOfflineData(user.id, school.id, setProgress);
      const summary = `تم تجهيز ${result.attendanceClasses} حلقة للحضور و${result.memorizationClasses} للحفظ، مع ${result.memorizationStudents} سجل طالب محفوظ محليًا.`;
      if (result.failures.length) {
        toast.warning(`${summary} تعذر تجهيز ${result.failures.length} عنصر؛ راجع الاتصال والصلاحيات.`, { duration: 9000 });
      } else {
        toast.success(summary, { duration: 7000 });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز بيانات العمل دون إنترنت.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || !isOnline}
        onClick={() => void handlePrepare()}
        className="h-9 gap-2 border-[#B8D2C1] bg-white text-[#0F5132] hover:bg-[#EAF3EC]"
        title="تحميل الحلقات والطلاب وسجلات الحفظ والحضور لهذا الجهاز"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : !isOnline ? <WifiOff size={15} /> : <Download size={15} />}
        <span className="hidden sm:inline">{busy && progress ? `تجهيز ${progress.completed}/${progress.total}` : "تجهيز دون إنترنت"}</span>
        <span className="sm:hidden">{busy ? "..." : "دون إنترنت"}</span>
      </Button>
    </div>
  );
}
