import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Inbox, RefreshCw, Send } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchMyNotifications,
  markNotificationRead,
  notificationCategoryLabels,
  type AppNotification,
  type NotificationBox,
  type NotificationCategory,
} from "@/lib/notifications";

const categories: Array<{ value: NotificationCategory | "all"; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "administration", label: "الإدارة" },
  { value: "learning", label: "التعليم والحفظ" },
  { value: "attendance", label: "الحضور" },
  { value: "finance", label: "المالية" },
  { value: "guardians", label: "الأولياء" },
  { value: "system", label: "النظام" },
];

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("ar-DZ", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function Notifications() {
  const [location, setLocation] = useLocation();
  const parentMode = location.startsWith("/parent/");
  const [box, setBox] = useState<NotificationBox>("inbox");
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setRows(await fetchMyNotifications(box, category === "all" ? null : category));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [box, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNotification = async (row: AppNotification) => {
    if (box !== "inbox") return;
    if (!row.readAt) {
      const marked = await markNotificationRead(row.notificationId);
      if (marked) {
        setRows(current => current.map(item =>
          item.notificationId === row.notificationId
            ? { ...item, readAt: new Date().toISOString() }
            : item
        ));
      }
    }
    if (row.targetPath) setLocation(row.targetPath);
  };

  return (
    <div className="space-y-5 p-1 sm:p-2" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#173B2D]">
            <Bell className="size-6 text-[#17663B]" /> مركز الإشعارات
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            سجل موحد للإشعارات الواردة والمرسلة من وحدات QuranOS.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      <Tabs value={box} onValueChange={value => setBox(value as NotificationBox)}>
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="inbox" className="gap-2"><Inbox className="size-4" /> الوارد</TabsTrigger>
          <TabsTrigger value="sent" className="gap-2"><Send className="size-4" /> المرسل</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map(item => (
          <Button
            key={item.value}
            size="sm"
            variant={category === item.value ? "default" : "outline"}
            className={category === item.value ? "bg-[#0B4738] hover:bg-[#0B4738]/90" : ""}
            onClick={() => setCategory(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50"><CardContent className="p-4 text-sm text-red-800">تعذر تحميل الإشعارات. أعد المحاولة.</CardContent></Card>
      )}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" /> جارٍ تحميل الإشعارات...
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground"><Bell className="size-8 opacity-40" />لا توجد إشعارات في هذا القسم بعد.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const unread = box === "inbox" && !row.readAt;
            const clickable = box === "inbox" && Boolean(row.targetPath);
            return (
              <button
                type="button"
                key={row.notificationId}
                onClick={() => void openNotification(row)}
                className={`w-full rounded-xl border bg-white p-4 text-right transition ${clickable ? "hover:border-[#8FB7A5] hover:shadow-sm" : "cursor-default"} ${unread ? "border-[#9CC8B4] bg-[#F5FBF7]" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {unread && <span className="size-2 rounded-full bg-[#17663B]" aria-label="غير مقروء" />}
                      <span className="font-bold text-[#173B2D]">{row.title}</span>
                      <Badge variant="outline">{notificationCategoryLabels[row.category]}</Badge>
                      {unread && <Badge className="bg-[#17663B]">جديد</Badge>}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#40564B]">{row.body}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>المدرسة: {row.schoolName}</span>
                      {row.studentName && <span>الطالب: {row.studentName}</span>}
                      {box === "inbox" ? (
                        <span>المرسل: {row.senderName ?? "النظام"}</span>
                      ) : (
                        <span>المستلم: {row.recipientName}</span>
                      )}
                      <span>{formatDate(row.createdAt)}</span>
                    </div>
                  </div>
                  {box === "inbox" && row.readAt && <CheckCheck className="mt-1 size-4 shrink-0 text-[#17663B]" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {parentMode && (
        <p className="text-xs text-muted-foreground">تعرض هذه الصفحة فقط الإشعارات المرتبطة بحساب ولي الأمر الحالي.</p>
      )}
    </div>
  );
}
