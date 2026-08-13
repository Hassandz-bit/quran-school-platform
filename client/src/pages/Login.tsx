import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  PWA_INSTALL_AVAILABLE_EVENT,
  canPromptPwaInstall,
  isPwaStandalone,
  promptPwaInstall,
} from "@/lib/pwa";
import { useLocation } from "wouter";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [, setLocation] = useLocation();
  const { signInWithPassword } = useAuth();
  const { locale: language, direction, setLocale } = useLocale();

  useEffect(() => {
    const refreshInstallState = () => {
      setCanInstall(canPromptPwaInstall() && !isPwaStandalone());
    };

    refreshInstallState();
    window.addEventListener(PWA_INSTALL_AVAILABLE_EVENT, refreshInstallState);
    window.addEventListener("appinstalled", refreshInstallState);

    return () => {
      window.removeEventListener(PWA_INSTALL_AVAILABLE_EVENT, refreshInstallState);
      window.removeEventListener("appinstalled", refreshInstallState);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const { error } = await signInWithPassword(email, password);

      if (error) {
        setErrorMessage(
          language === "ar"
            ? "تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور."
            : "Could not sign in. Check your email and password."
        );
        return;
      }

      setLocation("/post-login");
    } catch {
      setErrorMessage(
        language === "ar"
          ? "تعذر تسجيل الدخول حاليًا. حاول مرة أخرى لاحقًا."
          : "Could not sign in right now. Please try again later."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const outcome = await promptPwaInstall();
      if (outcome === "accepted" || outcome === "unavailable") {
        setCanInstall(false);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const content = {
    ar: {
      descriptor: "منظومة إدارة المدارس القرآنية",
      tagline: "تنظيم • تعليم • متابعة • إتقان",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      forgotPassword: "نسيت كلمة المرور؟",
      login: "تسجيل الدخول",
      loading: "جارٍ تسجيل الدخول...",
      install: "تثبيت QuranOS على الهاتف",
      installing: "جارٍ فتح التثبيت...",
      installHint: "يفتح كتطبيق مستقل من الشاشة الرئيسية.",
    },
    en: {
      descriptor: "Quran School Management System",
      tagline: "Organize • Teach • Follow up • Excel",
      email: "Email Address",
      password: "Password",
      forgotPassword: "Forgot password?",
      login: "Sign In",
      loading: "Signing in...",
      install: "Install QuranOS on this phone",
      installing: "Opening installer...",
      installHint: "Launch QuranOS as a standalone app from your home screen.",
    },
  };

  const t = content[language];

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      dir={direction}
      style={{ backgroundColor: "#0F5132" }}
    >
      <div className="absolute inset-0 opacity-[0.08]">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="islamic-geo"
              x="0"
              y="0"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M30,0 L60,30 L30,60 L0,30 Z"
                fill="none"
                stroke="white"
                strokeWidth="0.8"
              />
              <circle
                cx="30"
                cy="30"
                r="4"
                fill="none"
                stroke="white"
                strokeWidth="0.5"
              />
              <path
                d="M15,15 L45,15 L45,45 L15,45 Z"
                fill="none"
                stroke="white"
                strokeWidth="0.4"
              />
              <circle cx="0" cy="0" r="3" fill="white" opacity="0.3" />
              <circle cx="60" cy="0" r="3" fill="white" opacity="0.3" />
              <circle cx="0" cy="60" r="3" fill="white" opacity="0.3" />
              <circle cx="60" cy="60" r="3" fill="white" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#islamic-geo)" />
        </svg>
      </div>

      <div className="absolute top-6 start-6 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => setLocale("ar")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            language === "ar"
              ? "bg-[#DAAF37] text-[#0F5132] shadow-md"
              : "bg-white/15 text-white hover:bg-white/25"
          }`}
        >
          العربية
        </button>
        <button
          type="button"
          onClick={() => setLocale("en")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            language === "en"
              ? "bg-[#DAAF37] text-[#0F5132] shadow-md"
              : "bg-white/15 text-white hover:bg-white/25"
          }`}
        >
          English
        </button>
      </div>

      <div className="relative z-20 w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-8 text-center">
            <img
              src="/pwa-icon-192.svg"
              alt="QuranOS"
              className="mx-auto mb-4 size-24 rounded-[1.4rem] object-cover shadow-lg ring-1 ring-black/5"
            />
            <h1
              className="mb-1 text-3xl font-extrabold tracking-tight text-[#0F5132] font-heading"
              dir="ltr"
            >
              Quran<span className="text-[#DAAF37]">OS</span>
            </h1>
            <p className="text-sm font-bold text-[#294C3B]">{t.descriptor}</p>
            <p className="mt-2 text-xs font-semibold text-[#B28820]">{t.tagline}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.email}
              </label>
              <Input
                type="email"
                placeholder="admin@school.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full h-11 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.password}
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full h-11 text-base"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setLocation("/forgot-password")}
                className="text-sm text-[#0F5132] hover:text-[#B28820] transition-colors font-medium"
              >
                {t.forgotPassword}
              </button>
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {errorMessage}
              </p>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 text-base font-semibold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg active:scale-[0.97]"
              style={{ backgroundColor: "#0F5132", color: "white" }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {t.loading}
                </span>
              ) : (
                t.login
              )}
            </Button>
          </form>

          {canInstall && (
            <div className="mt-5 border-t border-gray-100 pt-5 text-center">
              <button
                type="button"
                onClick={() => void handleInstall()}
                disabled={isInstalling}
                className="w-full rounded-xl border border-[#0F5132]/20 bg-[#F7F5EF] px-4 py-3 text-sm font-bold text-[#0F5132] transition hover:bg-[#F1EDE2] disabled:cursor-wait disabled:opacity-60"
              >
                {isInstalling ? t.installing : t.install}
              </button>
              <p className="mt-2 text-xs text-gray-500">{t.installHint}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
