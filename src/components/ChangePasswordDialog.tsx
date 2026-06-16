import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { changePin } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Self-service PIN change for the currently logged-in user. Available to every
 * role — the backend `change_pin` command authorizes the caller against
 * AuthSession (own PIN, or admin changing anyone). Admins additionally manage
 * other users' PINs from User Management.
 */
export function ChangePasswordDialog({ collapsed }: { collapsed: boolean }) {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setPin("");
    setConfirm("");
  }

  async function handleSave() {
    if (!currentUser) return;
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      toast.error("PIN must be 4–6 digits");
      return;
    }
    if (pin !== confirm) {
      toast.error("PINs do not match");
      return;
    }
    setSaving(true);
    try {
      await changePin(currentUser.id, pin);
      toast.success("Password changed");
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="Change password"
            title="Change password"
            className="p-1 rounded flex-shrink-0 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-400/10 transition-colors"
          />
        }
      >
        <KeyRound size={collapsed ? 14 : 12} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>Update the PIN for {currentUser?.name}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-pin">New PIN (4–6 digits)</Label>
            <Input
              id="new-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              maxLength={6}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-pin">Confirm PIN</Label>
            <Input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirm}
              maxLength={6}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Change Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
