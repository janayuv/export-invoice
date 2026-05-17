import { useEffect, useState } from "react";
import { Delete, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "@/lib/utils";
import { type User, getActiveUsers, verifyPin } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_COLORS: Record<string, string> = {
  admin: "text-red-600",
  operator: "text-blue-600",
  viewer: "text-gray-500",
};

export function LoginScreen() {
  const { login } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [pin, setPin] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    getActiveUsers().then(setUsers);
  }, []);

  function pressDigit(d: string) {
    if (pin.length < 6) setPin((p) => p + d);
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  async function submit() {
    const userId = Number(selectedId);
    if (!userId || pin.length < 4) return;
    setIsVerifying(true);
    try {
      const user = await verifyPin(userId, pin);
      if (user) {
        login(user);
      } else {
        setShake(true);
        setPin("");
        toast.error("Incorrect PIN");
        setTimeout(() => setShake(false), 600);
      }
    } catch (e) {
      toast.error(`Login error: ${e}`);
    } finally {
      setIsVerifying(false);
    }
  }

  const PAD = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["C", "0", "⌫"],
  ] as const;

  function handlePadPress(key: string) {
    if (key === "⌫") backspace();
    else if (key === "C") setPin("");
    else pressDigit(key);
  }

  const selectedUser = users.find((u) => String(u.id) === selectedId);
  const canSubmit = !!selectedId && pin.length >= 4 && !isVerifying;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-72 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Export Invoice</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        <div className="border rounded-xl p-5 bg-card shadow-sm space-y-4">
          {/* User selector — base-ui Select used directly for precise ItemText control */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Select User
            </label>
            <SelectPrimitive.Root
              value={selectedId}
              onValueChange={(v) => { setSelectedId(String(v)); setPin(""); }}
            >
              <SelectPrimitive.Trigger
                className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent h-8 py-2 pr-2 pl-2.5 text-sm whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 data-placeholder:text-muted-foreground"
              >
                <SelectPrimitive.Value placeholder="Choose your name…">
                  {selectedUser && (
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{selectedUser.name}</span>
                      <span className={cn("text-xs capitalize", ROLE_COLORS[selectedUser.role])}>
                        {selectedUser.role}
                      </span>
                    </span>
                  )}
                </SelectPrimitive.Value>
                <SelectPrimitive.Icon>
                  <svg className="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>

              <SelectPrimitive.Portal>
                <SelectPrimitive.Positioner sideOffset={4} className="isolate z-50">
                  <SelectPrimitive.Popup className="w-(--anchor-width) min-w-40 rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 overflow-hidden py-1">
                    <SelectPrimitive.List>
                      {users.map((u) => (
                        <SelectPrimitive.Item
                          key={u.id}
                          value={String(u.id)}
                          className="relative flex w-full cursor-default items-center justify-between py-1.5 pr-8 pl-2.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-disabled:opacity-50"
                        >
                          {/* Only the name goes inside ItemText — this is what renders in the trigger */}
                          <SelectPrimitive.ItemText>
                            <span className="font-medium">{u.name}</span>
                          </SelectPrimitive.ItemText>
                          {/* Role badge is outside ItemText — shows in dropdown only */}
                          <span className={cn("text-xs capitalize ml-3", ROLE_COLORS[u.role])}>
                            {u.role}
                          </span>
                          <SelectPrimitive.ItemIndicator className="absolute right-2">
                            <Check className="size-3.5" />
                          </SelectPrimitive.ItemIndicator>
                        </SelectPrimitive.Item>
                      ))}
                    </SelectPrimitive.List>
                  </SelectPrimitive.Popup>
                </SelectPrimitive.Positioner>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>
          </div>

          {/* PIN dots */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              PIN
            </label>
            <div className={`flex justify-center gap-3.5 py-2 ${shake ? "animate-shake" : ""}`}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-3 h-3 rounded-full border-2 transition-all duration-150",
                    i < pin.length
                      ? "bg-primary border-primary scale-110"
                      : "border-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-2">
            {PAD.flat().map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePadPress(key)}
                disabled={!selectedId}
                className="h-11 rounded-lg border bg-background text-sm font-semibold
                  hover:bg-accent hover:text-accent-foreground
                  disabled:opacity-30 disabled:cursor-not-allowed
                  active:scale-95 transition-all select-none"
              >
                {key === "⌫" ? <Delete size={15} className="mx-auto" /> : key}
              </button>
            ))}
          </div>

          <Button className="w-full" onClick={submit} disabled={!canSubmit}>
            {isVerifying ? "Verifying…" : "Sign In"}
          </Button>
        </div>
      </div>
    </div>
  );
}
