import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  type User,
  type Permission,
  hasPermission,
  userCount,
  logout as rustLogout,
  restoreSession,
} from "@/lib/auth";
import { setDbReadGate } from "@/lib/db";

interface AuthContextValue {
  currentUser: User | null;
  isLoading: boolean;
  needsSetup: boolean;
  login: (user: User) => void;
  logout: () => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY       = "auth_user";
const SESSION_STARTED   = "session_started";
const LAST_ACTIVITY     = "last_activity";
const INACTIVITY_MS     = 30 * 60_000;
const ABSOLUTE_MS       = 8 * 60 * 60_000;
const CHECK_INTERVAL_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const clearSessionStorage = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_STARTED);
    sessionStorage.removeItem(LAST_ACTIVITY);
  }, []);

  const logout = useCallback(() => {
    rustLogout().catch(() => {});
    clearSessionStorage();
    setDbReadGate(false);
    setCurrentUser(null);
  }, [clearSessionStorage]);

  useEffect(() => {
    if (!currentUser) return;
    const resetActivity = () =>
      sessionStorage.setItem(LAST_ACTIVITY, Date.now().toString());
    ["mousedown", "keydown", "touchstart"].forEach((e) =>
      window.addEventListener(e, resetActivity)
    );
    return () => {
      ["mousedown", "keydown", "touchstart"].forEach((e) =>
        window.removeEventListener(e, resetActivity)
      );
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const started = Number(sessionStorage.getItem(SESSION_STARTED) ?? 0);
      const lastAct = Number(sessionStorage.getItem(LAST_ACTIVITY) ?? 0);
      if (now - lastAct > INACTIVITY_MS || now - started > ABSOLUTE_MS) {
        logout();
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentUser, logout]);

  useEffect(() => {
    async function init() {
      setDbReadGate(false);
      try {
        const count = await userCount();
        if (count === 0) {
          setNeedsSetup(true);
          setIsLoading(false);
          return;
        }
        const saved = sessionStorage.getItem(SESSION_KEY);
        if (saved) {
          const now = Date.now();
          const started = Number(sessionStorage.getItem(SESSION_STARTED) ?? 0);
          const lastAct = Number(sessionStorage.getItem(LAST_ACTIVITY) ?? 0);
          if (now - lastAct > INACTIVITY_MS || now - started > ABSOLUTE_MS) {
            clearSessionStorage();
          } else {
            const parsed = JSON.parse(saved) as User;
            try {
              const user = await restoreSession(parsed.id, started, lastAct);
              setCurrentUser(user);
            } catch {
              clearSessionStorage();
            }
          }
        }
      } catch {
        // DB not ready yet — treat as no session
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [clearSessionStorage]);

  const login = useCallback((user: User) => {
    const now = Date.now().toString();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    sessionStorage.setItem(SESSION_STARTED, now);
    sessionStorage.setItem(LAST_ACTIVITY, now);
    setDbReadGate(true);
    setCurrentUser(user);
    setNeedsSetup(false);
  }, []);

  const can = useCallback(
    (permission: Permission) => {
      if (!currentUser) return false;
      if (currentUser.permissions) {
        return currentUser.permissions.includes(permission);
      }
      return hasPermission(currentUser.role, permission);
    },
    [currentUser]
  );

  return (
    <AuthContext.Provider
      value={{ currentUser, isLoading, needsSetup, login, logout, can }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
