import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthError,
  Session,
  User,
  UserAttributes,
} from "@supabase/supabase-js";
import {
  AUTHORIZATION_MESSAGES,
  loadCurrentAuthorization as fetchCurrentAuthorization,
  type School,
  type SchoolMembership,
  type SchoolProfile,
  type SchoolRole,
} from "@/lib/authorization";
import { getSupabaseClient } from "@/lib/supabase";

export type {
  School,
  SchoolMembership,
  SchoolProfile,
  SchoolRole,
} from "@/lib/authorization";

type AuthOperationResult = {
  error: AuthError | null;
};

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: SchoolProfile | null;
  membership: SchoolMembership | null;
  school: School | null;
  roles: SchoolRole[];
  activeRoleCodes: string[];
  authorizationLoading: boolean;
  authorizationError: string | null;
  isSchoolAdmin: boolean;
  isPasswordRecovery: boolean;
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
  clearPasswordRecovery: () => void;
  reloadAuthorization: () => Promise<void>;
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
  const [profile, setProfile] = useState<SchoolProfile | null>(null);
  const [membership, setMembership] = useState<SchoolMembership | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [roles, setRoles] = useState<SchoolRole[]>([]);
  const [activeRoleCodes, setActiveRoleCodes] = useState<string[]>([]);
  const [isSchoolAdmin, setIsSchoolAdmin] = useState(false);
  const [authorizationLoading, setAuthorizationLoading] = useState(false);
  const [authorizationError, setAuthorizationError] = useState<string | null>(
    null
  );
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const authorizationGenerationRef = useRef(0);

  const clearAuthorization = useCallback(
    (nextError: string | null = null) => {
      setProfile(null);
      setMembership(null);
      setSchool(null);
      setRoles([]);
      setActiveRoleCodes([]);
      setIsSchoolAdmin(false);
      setAuthorizationError(nextError);
      setAuthorizationLoading(false);
    },
    []
  );

  const loadCurrentAuthorization = useCallback(
    async (userId: string, generation: number) => {
      const client = clientState.client;

      if (!client) return;

      const isCurrentRequest = () =>
        generation === authorizationGenerationRef.current;

      if (!isCurrentRequest()) return;

      setAuthorizationLoading(true);
      setProfile(null);
      setMembership(null);
      setSchool(null);
      setRoles([]);
      setActiveRoleCodes([]);
      setIsSchoolAdmin(false);
      setAuthorizationError(null);

      const authorization = await fetchCurrentAuthorization(client, userId);

      if (!isCurrentRequest()) return;

      setProfile(authorization.profile);
      setMembership(authorization.membership);
      setSchool(authorization.school);
      setRoles(authorization.roles);
      setActiveRoleCodes(authorization.activeRoleCodes);
      setIsSchoolAdmin(authorization.isSchoolAdmin);
      setAuthorizationError(authorization.authorizationError);
      setAuthorizationLoading(false);
    },
    [clientState.client]
  );

  useEffect(() => {
    const client = clientState.client;

    if (!client) {
      setLoading(false);
      clearAuthorization(AUTHORIZATION_MESSAGES.connectionError);
      return;
    }

    let isMounted = true;
    const authorizationTimers = new Set<ReturnType<typeof setTimeout>>();

    const applySession = (nextSession: Session | null) => {
      if (!isMounted) return;

      const generation = ++authorizationGenerationRef.current;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (!nextSession?.user) {
        clearAuthorization();
        return;
      }

      setAuthorizationLoading(true);
      const timer = setTimeout(() => {
        authorizationTimers.delete(timer);
        if (isMounted) {
          void loadCurrentAuthorization(nextSession.user.id, generation);
        }
      }, 0);
      authorizationTimers.add(timer);
    };

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      applySession(nextSession);

      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(Boolean(nextSession));
      } else if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;

      if (error) {
        applySession(null);
        setIsPasswordRecovery(false);
      } else {
        applySession(data.session);
      }
    });

    return () => {
      isMounted = false;
      authorizationGenerationRef.current += 1;
      authorizationTimers.forEach(timer => clearTimeout(timer));
      subscription.unsubscribe();
    };
  }, [clearAuthorization, clientState.client, loadCurrentAuthorization]);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<AuthOperationResult> => {
      const { data, error } = await clientState.client!.auth.signInWithPassword({
        email,
        password,
      });

      if (!error) {
        setIsPasswordRecovery(false);

        if (data.session?.user) {
          const generation = ++authorizationGenerationRef.current;
          setSession(data.session);
          setUser(data.session.user);
          setLoading(false);
          await loadCurrentAuthorization(data.session.user.id, generation);
        }
      }

      return { error };
    },
    [clientState.client, loadCurrentAuthorization]
  );

  const signOut = useCallback(async (): Promise<AuthOperationResult> => {
    const { error } = await clientState.client!.auth.signOut({ scope: "local" });

    if (!error) {
      authorizationGenerationRef.current += 1;
      setSession(null);
      setUser(null);
      setIsPasswordRecovery(false);
      clearAuthorization();
    }

    return { error };
  }, [clearAuthorization, clientState.client]);

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

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const reloadAuthorization = useCallback(async () => {
    const currentUser = session?.user;
    if (!currentUser) {
      clearAuthorization();
      return;
    }
    const generation = ++authorizationGenerationRef.current;
    await loadCurrentAuthorization(currentUser.id, generation);
  }, [clearAuthorization, loadCurrentAuthorization, session?.user]);

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
        profile,
        membership,
        school,
        roles,
        activeRoleCodes,
        authorizationLoading,
        authorizationError,
        isSchoolAdmin,
        isPasswordRecovery,
        signInWithPassword,
        signOut,
        resetPasswordForEmail,
        updateUser,
        clearPasswordRecovery,
        reloadAuthorization,
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
