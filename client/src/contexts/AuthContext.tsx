import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthError,
  Session,
  User,
  UserAttributes,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

type AuthOperationResult = {
  error: AuthError | null;
};

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<AuthOperationResult>;
  signOut: () => Promise<AuthOperationResult>;
  resetPasswordForEmail: (
    email: string,
    redirectTo: string
  ) => Promise<AuthOperationResult>;
  updateUser: (attributes: UserAttributes) => Promise<AuthOperationResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const clientState = useMemo(() => {
    try {
      return {
        client: getSupabaseClient(),
        configurationError: null,
      };
    } catch (error) {
      return {
        client: null,
        configurationError:
          error instanceof Error
            ? error.message
            : "تعذر تهيئة اتصال Supabase.",
      };
    }
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = clientState.client;

    if (!client) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;

      if (error) {
        setSession(null);
        setUser(null);
      } else {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clientState.client]);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<AuthOperationResult> => {
      const { error } = await clientState.client!.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    },
    [clientState.client]
  );

  const signOut = useCallback(async (): Promise<AuthOperationResult> => {
    const { error } = await clientState.client!.auth.signOut();
    return { error };
  }, [clientState.client]);

  const resetPasswordForEmail = useCallback(
    async (
      email: string,
      redirectTo: string
    ): Promise<AuthOperationResult> => {
      const { error } = await clientState.client!.auth.resetPasswordForEmail(
        email,
        { redirectTo }
      );
      return { error };
    },
    [clientState.client]
  );

  const updateUser = useCallback(
    async (attributes: UserAttributes): Promise<AuthOperationResult> => {
      const { error } = await clientState.client!.auth.updateUser(attributes);
      return { error };
    },
    [clientState.client]
  );

  if (clientState.configurationError) {
    return (
      <main
        className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4"
        dir="rtl"
      >
        <section
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg"
        >
          <h1 className="text-xl font-bold text-[#2C3E50]">
            تعذر إعداد المصادقة
          </h1>
          <p className="mt-3 text-sm leading-7 text-red-700">
            {clientState.configurationError}
          </p>
          <p className="mt-3 text-sm text-gray-600">
            أضف القيم محليًا ثم أعد تشغيل التطبيق. لن تُعرض قيم الإعدادات في
            الصفحة.
          </p>
        </section>
      </main>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signInWithPassword,
        signOut,
        resetPasswordForEmail,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("يجب استخدام useAuth داخل AuthProvider.");
  }

  return context;
}
