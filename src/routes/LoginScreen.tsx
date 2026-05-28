import { useEffect, useRef, useState } from "react";
import { Delete, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type User, getActiveUsers, verifyPin } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
];

const ROLE_BADGE: Record<string, string> = {
  admin:    "bg-red-500/15 text-red-400",
  operator: "bg-blue-500/15 text-blue-400",
  viewer:   "bg-zinc-500/20 text-zinc-400",
};

// null = invisible spacer (replaces the old "C" clear key)
const PAD_KEYS: (string | null)[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [null, "0", "⌫"],
];

/**
 * Robustly parse a lockout timestamp that may arrive as either:
 *  - ISO 8601 with Z suffix: "2026-05-22T18:45:00Z"  (Rust output after fix)
 *  - SQLite bare datetime:   "2026-05-22 18:45:00"   (legacy, treated as UTC)
 */
function parseLockoutDate(until: string): Date {
  if (until.includes("T") || until.endsWith("Z")) return new Date(until);
  return new Date(until.replace(" ", "T") + "Z");
}

export function LoginScreen() {
  const { login } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [pin, setPin] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  // lockoutUntil: ISO string from Rust while account is locked
  const [lockoutUntil, setLockoutUntil] = useState<string | null>(null);

  // Always points to the latest submit — avoids stale closure inside setTimeout
  const submitRef = useRef<(pinOverride?: string) => void>(() => {});

  useEffect(() => {
    getActiveUsers().then(setUsers);
  }, []);

  // Auto-clear lockout state when the expiry time passes.
  useEffect(() => {
    if (!lockoutUntil) return;
    const ms = parseLockoutDate(lockoutUntil).getTime() - Date.now();
    if (ms <= 0) { setLockoutUntil(null); return; }
    const timer = setTimeout(() => setLockoutUntil(null), ms);
    return () => clearTimeout(timer);
  }, [lockoutUntil]);

  function handleUserSelect(id: string) {
    setSelectedId(id);
    setPin("");
    setLockoutUntil(null);
  }

  async function submit(pinOverride?: string) {
    const pinValue = pinOverride ?? pin;
    const userId = Number(selectedId);
    if (!userId || pinValue.length < 4) return;
    setIsVerifying(true);
    try {
      const result = await verifyPin(userId, pinValue);
      if (result.status === "success") {
        setLockoutUntil(null);
        login(result.user);
      } else if (result.status === "locked") {
        setLockoutUntil(result.until);
        setPin("");
        const lockedTime = parseLockoutDate(result.until).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        toast.error(`Account locked — try again after ${lockedTime}`);
      } else {
        // status === "failed"
        setLockoutUntil(null);
        setShake(true);
        setPin("");
        const rem = result.remaining_attempts;
        toast.error(
          rem === 1
            ? "Incorrect PIN — 1 attempt left before lockout"
            : `Incorrect PIN — ${rem} attempts left`
        );
        setTimeout(() => setShake(false), 600);
      }
    } catch (e) {
      toast.error(`Login error: ${e}`);
    } finally {
      setIsVerifying(false);
    }
  }

  // Update ref every render so setTimeout always calls the latest version
  submitRef.current = submit;

  function pressDigit(d: string) {
    if (pin.length >= 6 || !selectedId || lockoutUntil) return;
    const next = pin + d;
    setPin(next);
    // Auto-submit when PIN reaches 6 digits; pass `next` directly to avoid stale state
    if (next.length === 6) {
      setTimeout(() => submitRef.current(next), 80);
    }
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  const isLocked = lockoutUntil != null;
  const canSubmit = !!selectedId && pin.length >= 4 && !isVerifying && !isLocked;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#09090b" }}
    >
      {/* Logo mark */}
      <div className="flex items-center gap-2 mb-8">
        <div
          className="flex items-center justify-center rounded-[8px] shrink-0"
          style={{ width: 32, height: 32, background: "#818cf8" }}
        >
          <Package size={16} color="#fff" />
        </div>
        <span className="text-[15px] font-semibold text-zinc-100">Export Invoice</span>
      </div>

      {/* Card */}
      <div
        className="w-full rounded-xl p-6 space-y-5"
        style={{
          maxWidth: 396,
          background: "#18181b",
          border: "1px solid #27272a",
        }}
      >
        {/* Heading */}
        <div className="text-center space-y-0.5">
          <h1 className="text-[18px] font-bold text-zinc-50">Welcome back</h1>
          <p className="text-[12px] text-zinc-500">Select your account and enter your PIN</p>
        </div>

        {/* ── User card grid ── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500">
            Select User
          </p>
          <div className="grid grid-cols-2 gap-2">
            {users.map((u, idx) => {
              const isSelected = String(u.id) === selectedId;
              const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              const initial = u.name.trim()[0]?.toUpperCase() ?? "?";
              const firstName = u.name.trim().split(/\s+/)[0];
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleUserSelect(String(u.id))}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-100 text-left"
                  style={{
                    background: isSelected ? "rgba(129,140,248,0.13)" : "#09090b",
                    border: isSelected ? "1px solid #818cf8" : "1px solid #27272a",
                  }}
                >
                  {/* Letter avatar */}
                  <div
                    className="flex items-center justify-center shrink-0 rounded-full text-[12px] font-bold text-white"
                    style={{ width: 30, height: 30, background: avatarColor }}
                  >
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-100 truncate">{firstName}</p>
                    <span
                      className={cn(
                        "inline-flex items-center px-1 py-px rounded text-[9px] font-semibold uppercase tracking-wide",
                        ROLE_BADGE[u.role] ?? "bg-zinc-500/20 text-zinc-400"
                      )}
                    >
                      {u.role}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── PIN dots ── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500">PIN</p>
          <div className={cn("flex justify-center gap-3 py-1", shake && "animate-shake")}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-150"
                style={{
                  width: 12,
                  height: 12,
                  border: i < pin.length ? "2px solid #818cf8" : "2px solid #3f3f46",
                  background: i < pin.length ? "#818cf8" : "transparent",
                  transform: i < pin.length ? "scale(1.1)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Lockout banner ── */}
        {isLocked && (
          <div
            className="rounded-lg px-3 py-2 text-[12px] text-red-400 text-center"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            Account locked until{" "}
            {parseLockoutDate(lockoutUntil!).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}

        {/* ── Keypad ── */}
        <div className="flex justify-center">
          <div className="grid grid-cols-3 gap-2" style={{ width: 224 }}>
            {PAD_KEYS.flat().map((key, idx) => {
              // null = invisible spacer in position [3][0] (old "C" slot)
              if (key === null) return <div key={idx} />;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => (key === "⌫" ? backspace() : pressDigit(key))}
                  disabled={!selectedId || isLocked}
                  className="flex items-center justify-center h-12 rounded-lg text-[15px] font-semibold text-zinc-100 transition-all duration-[80ms] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed select-none"
                  style={{ background: "#27272a", border: "1px solid #3f3f46" }}
                >
                  {key === "⌫" ? <Delete size={15} /> : key}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Sign In ── */}
        <Button className="w-full" onClick={() => submit()} disabled={!canSubmit}>
          {isVerifying ? "Verifying…" : "Sign In"}
        </Button>
      </div>
    </div>
  );
}
