import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiPost, ApiError } from "../api/client";
import type { AuthResponse, User } from "../api/types";

// Admin deliberately excluded — self-registration can only ever create a customer or organiser
// account. The backend enforces this too (zod rejects "admin" outright), so this is a UX
// convenience, not the actual security boundary.
export type SelfServeRole = "customer" | "organiser";

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  // `role` only takes effect when this call creates a brand-new account — it's ignored when
  // linking to (or logging into) an account that already exists, same as the backend.
  loginWithGoogle: (idToken: string, role?: SelfServeRole) => Promise<void>;
  register: (email: string, password: string, name: string, role: SelfServeRole) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser(): User | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function persist(auth: AuthResponse) {
  localStorage.setItem("token", auth.token);
  localStorage.setItem("user", JSON.stringify(auth.user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadStoredUser);

  // localStorage is shared across every tab of a browser, but this state was only read once at
  // mount — so logging into a second account in another tab left this tab showing the *old*
  // user's name in the header while every request it made carried the *new* account's token.
  // The UI was actively lying about who you were signed in as. The `storage` event fires only in
  // the other tabs (never the one that wrote), which is exactly the set that needs resyncing.
  useEffect(() => {
    function syncFromStorage(event: StorageEvent) {
      // `key === null` means localStorage.clear() — treat it as a change like any other.
      if (event.key !== null && event.key !== "user" && event.key !== "token") return;
      setUser(loadStoredUser());
    }
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const auth = await apiPost<AuthResponse>("/api/auth/login", { email, password });
    persist(auth);
    setUser(auth.user);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string, role: SelfServeRole = "customer") => {
    const auth = await apiPost<AuthResponse>("/api/auth/google", { idToken, role });
    persist(auth);
    setUser(auth.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, role: SelfServeRole) => {
    const auth = await apiPost<AuthResponse>("/api/auth/register", { email, password, name, role });
    persist(auth);
    setUser(auth.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
