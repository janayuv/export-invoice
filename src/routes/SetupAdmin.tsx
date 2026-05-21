import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUser } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveUsers } from "@/lib/auth";

export function SetupAdmin() {
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }
    if (pin.length < 4) {
      toast.error("PIN must be at least 4 digits");
      return;
    }
    if (!/^\d+$/.test(pin)) {
      toast.error("PIN must contain digits only");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }

    setIsCreating(true);
    try {
      await createUser(trimmedName, pin, "admin");
      toast.success("Admin account created — signing you in");
      const users = await getActiveUsers();
      const created = users.find((u) => u.name === trimmedName);
      if (created) login(created);
    } catch (e) {
      toast.error(`Failed to create admin: ${e}`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-2 self-center text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <span className="font-medium">Export Invoice</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">First-Time Setup</CardTitle>
            <CardDescription>Create an admin account to get started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="admin-name">Your Name</Label>
            <Input
              id="admin-name"
              placeholder="e.g. S.DINESH"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="admin-pin">PIN (4–6 digits)</Label>
            <Input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="admin-pin-confirm">Confirm PIN</Label>
            <Input
              id="admin-pin-confirm"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          <Button className="w-full" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? "Creating…" : "Create Admin Account"}
          </Button>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          This admin account can manage other users from Settings.
        </p>
      </div>
    </div>
  );
}
