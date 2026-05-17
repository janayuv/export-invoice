import { useEffect, useState } from "react";
import { Plus, Pencil, KeyRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type User,
  type UserRole,
  getUsers,
  createUser,
  updateUser,
  changePin,
} from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";

type PanelMode = "add" | "edit" | "pin" | null;

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  operator: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

export function UserManagement() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("operator");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPin, setFormPin] = useState("");
  const [formPinConfirm, setFormPinConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    const list = await getUsers();
    setUsers(list);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setSelectedUser(null);
    setFormName("");
    setFormRole("operator");
    setFormIsActive(true);
    setFormPin("");
    setFormPinConfirm("");
    setPanelMode("add");
  }

  function openEdit(u: User) {
    setSelectedUser(u);
    setFormName(u.name);
    setFormRole(u.role);
    setFormIsActive(u.is_active === 1);
    setFormPin("");
    setFormPinConfirm("");
    setPanelMode("edit");
  }

  function openPin(u: User) {
    setSelectedUser(u);
    setFormPin("");
    setFormPinConfirm("");
    setPanelMode("pin");
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedUser(null);
  }

  async function handleAdd() {
    const trimmed = formName.trim();
    if (!trimmed) { toast.error("Name is required"); return; }
    if (formPin.length < 4 || !/^\d+$/.test(formPin)) {
      toast.error("PIN must be 4–6 digits"); return;
    }
    if (formPin !== formPinConfirm) { toast.error("PINs do not match"); return; }
    setIsSaving(true);
    try {
      await createUser(trimmed, formPin, formRole);
      toast.success("User created");
      closePanel();
      load();
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEdit() {
    if (!selectedUser) return;
    const trimmed = formName.trim();
    if (!trimmed) { toast.error("Name is required"); return; }
    if (selectedUser.id === currentUser?.id && !formIsActive) {
      toast.error("You cannot deactivate your own account"); return;
    }
    setIsSaving(true);
    try {
      await updateUser(selectedUser.id, trimmed, formRole, formIsActive);
      toast.success("User updated");
      closePanel();
      load();
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChangePin() {
    if (!selectedUser) return;
    if (formPin.length < 4 || !/^\d+$/.test(formPin)) {
      toast.error("PIN must be 4–6 digits"); return;
    }
    if (formPin !== formPinConfirm) { toast.error("PINs do not match"); return; }
    setIsSaving(true);
    try {
      await changePin(selectedUser.id, formPin);
      toast.success("PIN changed");
      closePanel();
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }

  const panelTitle =
    panelMode === "add" ? "Add User" :
    panelMode === "edit" ? `Edit — ${selectedUser?.name}` :
    panelMode === "pin" ? `Change PIN — ${selectedUser?.name}` : "";

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage who can access this application
          </p>
        </div>
        {!panelMode && (
          <Button onClick={openAdd} size="sm">
            <Plus size={16} className="mr-1" /> Add User
          </Button>
        )}
      </div>

      {/* Inline form panel */}
      {panelMode && (
        <div className="border rounded-lg bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base">{panelTitle}</h3>
            <button
              onClick={closePanel}
              className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Name — add & edit only */}
            {(panelMode === "add" || panelMode === "edit") && (
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  placeholder="Full name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
            )}

            {/* Role — add & edit only */}
            {(panelMode === "add" || panelMode === "edit") && (
              <div className="space-y-1">
                <Label>Role</Label>
                <Select
                  value={formRole}
                  onValueChange={(v) => v && setFormRole(v as UserRole)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Active toggle — edit only */}
            {panelMode === "edit" && (
              <div className="col-span-2 flex items-center gap-3">
                <input
                  id="is-active"
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                  disabled={selectedUser?.id === currentUser?.id}
                />
                <Label htmlFor="is-active">Active account</Label>
                {selectedUser?.id === currentUser?.id && (
                  <span className="text-xs text-muted-foreground">(cannot deactivate yourself)</span>
                )}
              </div>
            )}

            {/* PIN fields — add & pin mode */}
            {(panelMode === "add" || panelMode === "pin") && (
              <>
                <div className="space-y-1">
                  <Label>{panelMode === "pin" ? "New PIN (4–6 digits)" : "PIN (4–6 digits)"}</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••"
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Confirm PIN</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••"
                    value={formPinConfirm}
                    onChange={(e) => setFormPinConfirm(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={closePanel}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSaving}
              onClick={
                panelMode === "add" ? handleAdd :
                panelMode === "edit" ? handleEdit :
                handleChangePin
              }
            >
              {isSaving ? "Saving…" :
                panelMode === "add" ? "Create User" :
                panelMode === "edit" ? "Save Changes" :
                "Change PIN"}
            </Button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={u.is_active !== 1 ? "opacity-50" : ""}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === currentUser?.id && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_COLORS[u.role]}`}>
                    {u.role}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={u.is_active === 1 ? "default" : "secondary"}>
                    {u.is_active === 1 ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {u.created_at.split("T")[0]}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Edit user"
                      onClick={() => openEdit(u)}
                      disabled={!!panelMode}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Change PIN"
                      onClick={() => openPin(u)}
                      disabled={!!panelMode}
                    >
                      <KeyRound size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
