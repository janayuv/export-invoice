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
} from "@/lib/auth";

interface AuthContextValue {
  currentUser: User | null;
  isLoading: boolean;
  needsSetup: boolean;
  login: (user: User) => void;
  logout: () => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = "auth_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const count = await userCount();
        if (count === 0) {
          setNeedsSetup(true);
          setIsLoading(false);
          return;
        }
        const saved = sessionStorage.getItem(SESSION_KEY);
        if (saved) {
          setCurrentUser(JSON.parse(saved) as User);
        }
      } catch {
        // DB not ready yet — treat as no session
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const login = useCallback((user: User) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    setCurrentUser(user);
    setNeedsSetup(false);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
  }, []);

  const can = useCallback(
    (permission: Permission) => {
      if (!currentUser) return false;
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
