export interface Student {
  id: number;
  name: string;
  email: string;
  phone: string;
  branch: string;
  class: string;
  status: "نشط" | "موقوف" | "منقول" | "متخرج";
  memorized: string;
}

export const mockStudents: Student[] = [
  {
    id: 1,
    name: "أحمد محمد",
    email: "ahmed@example.com",
    phone: "0551234567",
    branch: "الفرع الرئيسي",
    class: "حلقة الفجر",
    status: "نشط",
    memorized: "5 أجزاء",
  },
  {
    id: 2,
    name: "فاطمة علي",
    email: "fatima@example.com",
    phone: "0559876543",
    branch: "الفرع الرئيسي",
    class: "حلقة العصر",
    status: "نشط",
    memorized: "3 أجزاء",
  },
  {
    id: 3,
    name: "محمد حسن",
    email: "hassan@example.com",
    phone: "0553456789",
    branch: "فرع الشرق",
    class: "حلقة الفجر",
    status: "موقوف",
    memorized: "2 أجزاء",
  },
  {
    id: 4,
    name: "سارة إبراهيم",
    email: "sarah@example.com",
    phone: "0557654321",
    branch: "الفرع الرئيسي",
    class: "حلقة المغرب",
    status: "نشط",
    memorized: "8 أجزاء",
  },
  {
    id: 5,
    name: "يوسف بن عمر",
    email: "youssef@example.com",
    phone: "0552345678",
    branch: "فرع الغرب",
    class: "حلقة العصر",
    status: "نشط",
    memorized: "12 أجزاء",
  },
  {
    id: 6,
    name: "خديجة بوعلام",
    email: "khadija@example.com",
    phone: "0558765432",
    branch: "فرع الشرق",
    class: "حلقة المغرب",
    status: "منقول",
    memorized: "6 أجزاء",
  },
  {
    id: 7,
    name: "عبد الرحمن سعيد",
    email: "abdel@example.com",
    phone: "0554567890",
    branch: "الفرع الرئيسي",
    class: "حلقة الفجر",
    status: "نشط",
    memorized: "15 أجزاء",
  },
  {
    id: 8,
    name: "مريم بن حسين",
    email: "meriem@example.com",
    phone: "0556789012",
    branch: "فرع الغرب",
    class: "حلقة العصر",
    status: "متخرج",
    memorized: "30 أجزاء",
  },
];
