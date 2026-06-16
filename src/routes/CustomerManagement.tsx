import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Globe, MapPin, Truck } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  type Customer,
  type CustomerFormData,
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/customer";

type PanelMode = "add" | "edit" | null;

const EMPTY_FORM: CustomerFormData = {
  name: "",
  address: "",
  country_of_destination: "",
  port_of_discharge: "",
  final_destination: "",
  currency: "USD",
  pre_carriage_by: "BY ROAD",
  place_of_receipt: "CHENNAI",
  pre_carrier: "CHENNAI",
  port_of_loading: "CHENNAI",
};

export function CustomerManagement() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    const list = await getCustomers();
    setCustomers(list);
  }

  useEffect(() => { load(); }, []);

  function set(field: keyof CustomerFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openAdd() {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setPanelMode("add");
  }

  function openEdit(c: Customer) {
    setSelectedId(c.id);
    setForm({
      name: c.name,
      address: c.address,
      country_of_destination: c.country_of_destination,
      port_of_discharge: c.port_of_discharge,
      final_destination: c.final_destination,
      currency: c.currency,
      pre_carriage_by: c.pre_carriage_by,
      place_of_receipt: c.place_of_receipt,
      pre_carrier: c.pre_carrier,
      port_of_loading: c.port_of_loading,
    });
    setPanelMode("edit");
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedId(null);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Customer name is required"); return; }
    setIsSaving(true);
    try {
      if (panelMode === "add") {
        await createCustomer(form);
        toast.success("Customer added");
      } else if (panelMode === "edit" && selectedId) {
        await updateCustomer(selectedId, form);
        toast.success("Customer updated");
      }
      closePanel();
      load();
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(c: Customer) {
    const ok = await confirm({
      title: "Delete customer?",
      description: `Delete customer "${c.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteCustomer(c.id);
      toast.success("Customer deleted");
      load();
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }

  return (
    <div className="p-[18px] space-y-3 animate-fade-up max-w-5xl mx-auto">
      {confirmDialog}

      <PageHeader
        title="Customers"
        subtitle="Saved consignees — select when creating an invoice to auto-fill fields"
        actions={
          !panelMode ? (
            <Button size="sm" onClick={openAdd}>
              <Plus size={13} className="mr-1.5" /> Add Customer
            </Button>
          ) : undefined
        }
      />

        {/* Inline form panel */}
        {panelMode && (
          <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
              {panelMode === "add" ? "Add Customer" : `Edit — ${form.name || "Customer"}`}
              </h3>
              <button
                onClick={closePanel}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            {/* Consignee details */}
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MapPin size={13} className="text-primary" />
                Consignee Details
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer / Consignee Name *</Label>
                  <Input
                    placeholder="CTR CO.,LTD."
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Country of Destination</Label>
                  <Input
                    placeholder="KOREA"
                    value={form.country_of_destination}
                    onChange={(e) => set("country_of_destination", e.target.value)}
                  />
                </div>
                <div className="col-span-1 space-y-1.5 md:col-span-2">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Consignee Address</Label>
                  <Textarea
                    rows={3}
                    placeholder={"# 68-26 Daehapsaneopdanji-ro,Hap-ri,\nDaehap-myeon, Republic of Korea. Zip Code: 50307"}
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Shipping defaults */}
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Truck size={13} className="text-primary" />
                Shipping Defaults
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Currency</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(v) => v && set("currency", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["USD", "EUR", "GBP", "AED", "INR"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pre-Carriage by</Label>
                  <Input
                    placeholder="BY ROAD"
                    value={form.pre_carriage_by}
                    onChange={(e) => set("pre_carriage_by", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Place of Receipt</Label>
                  <Input
                    placeholder="CHENNAI"
                    value={form.place_of_receipt}
                    onChange={(e) => set("place_of_receipt", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pre Carrier</Label>
                  <Input
                    placeholder="CHENNAI"
                    value={form.pre_carrier}
                    onChange={(e) => set("pre_carrier", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Port of Loading</Label>
                  <Input
                    placeholder="CHENNAI"
                    value={form.port_of_loading}
                    onChange={(e) => set("port_of_loading", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Port of Discharge</Label>
                  <Input
                    placeholder="BUSHAN"
                    value={form.port_of_discharge}
                    onChange={(e) => set("port_of_discharge", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Final Destination</Label>
                  <Input
                    placeholder="korea"
                    value={form.final_destination}
                    onChange={(e) => set("final_destination", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={closePanel}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving…" : panelMode === "add" ? "Add Customer" : "Save Changes"}
              </Button>
            </div>
          </div>
        )}

        {/* Customers table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="text-muted-foreground">Customer / Consignee</TableHead>
                <TableHead className="text-muted-foreground">Country</TableHead>
                <TableHead className="text-muted-foreground">Currency</TableHead>
                <TableHead className="text-muted-foreground">Port of Discharge</TableHead>
                <TableHead className="text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/50">
                <TableCell>
                  <div className="font-medium text-foreground">{c.name}</div>
                  {c.address && (
                    <div className="line-clamp-1 max-w-52 text-xs text-muted-foreground">
                      {c.address.split("\n")[0]}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Globe size={13} className="text-muted-foreground" />
                    <span>{c.country_of_destination || "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm font-medium text-primary">{c.currency}</TableCell>
                <TableCell className="text-sm">{c.port_of_discharge || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-primary"
                      title="Edit"
                      onClick={() => openEdit(c)}
                      disabled={!!panelMode}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      title="Delete"
                      onClick={() => handleDelete(c)}
                      disabled={!!panelMode}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
                </TableRow>
              ))}
              {customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No customers yet — add your first consignee above
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
    </div>
  );
}
