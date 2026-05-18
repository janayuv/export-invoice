import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Globe, Building2, MapPin, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
    if (!confirm(`Delete customer "${c.name}"?`)) return;
    try {
      await deleteCustomer(c.id);
      toast.success("Customer deleted");
      load();
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-100 via-white to-indigo-50/30">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm shadow-slate-200/70 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25">
                <Building2 size={18} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Customers</h2>
                <p className="mt-1 text-sm text-slate-500">
            Saved consignees — select when creating an invoice to auto-fill fields
                </p>
              </div>
            </div>
            {!panelMode && (
              <Button onClick={openAdd} className="bg-indigo-600 text-white hover:bg-indigo-700">
                <Plus size={16} className="mr-1" /> Add Customer
              </Button>
            )}
          </div>
        </div>

        {/* Inline form panel */}
        {panelMode && (
          <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
              {panelMode === "add" ? "Add Customer" : `Edit — ${form.name || "Customer"}`}
              </h3>
              <button
                onClick={closePanel}
                className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            {/* Consignee details */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <MapPin size={13} className="text-indigo-600" />
                Consignee Details
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Customer / Consignee Name *</Label>
                  <Input
                    placeholder="CTR CO.,LTD."
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Country of Destination</Label>
                  <Input
                    placeholder="KOREA"
                    value={form.country_of_destination}
                    onChange={(e) => set("country_of_destination", e.target.value)}
                  />
                </div>
                <div className="col-span-1 space-y-1.5 md:col-span-2">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Consignee Address</Label>
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
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <Truck size={13} className="text-indigo-600" />
                Shipping Defaults
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Currency</Label>
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
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Pre-Carriage by</Label>
                  <Input
                    placeholder="BY ROAD"
                    value={form.pre_carriage_by}
                    onChange={(e) => set("pre_carriage_by", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Place of Receipt</Label>
                  <Input
                    placeholder="CHENNAI"
                    value={form.place_of_receipt}
                    onChange={(e) => set("place_of_receipt", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Pre Carrier</Label>
                  <Input
                    placeholder="CHENNAI"
                    value={form.pre_carrier}
                    onChange={(e) => set("pre_carrier", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Port of Loading</Label>
                  <Input
                    placeholder="CHENNAI"
                    value={form.port_of_loading}
                    onChange={(e) => set("port_of_loading", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Port of Discharge</Label>
                  <Input
                    placeholder="BUSHAN"
                    value={form.port_of_discharge}
                    onChange={(e) => set("port_of_discharge", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">Final Destination</Label>
                  <Input
                    placeholder="korea"
                    value={form.final_destination}
                    onChange={(e) => set("final_destination", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <Button variant="outline" size="sm" onClick={closePanel} className="border-slate-300 text-slate-700">Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="bg-indigo-600 text-white hover:bg-indigo-700">
                {isSaving ? "Saving…" : panelMode === "add" ? "Add Customer" : "Save Changes"}
              </Button>
            </div>
          </div>
        )}

        {/* Customers table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50/90">
              <TableRow>
                <TableHead className="text-slate-700">Customer / Consignee</TableHead>
                <TableHead className="text-slate-700">Country</TableHead>
                <TableHead className="text-slate-700">Currency</TableHead>
                <TableHead className="text-slate-700">Port of Discharge</TableHead>
                <TableHead className="text-right text-slate-700">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id} className="hover:bg-slate-50/80">
                <TableCell>
                  <div className="font-medium text-slate-900">{c.name}</div>
                  {c.address && (
                    <div className="line-clamp-1 max-w-52 text-xs text-slate-500">
                      {c.address.split("\n")[0]}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Globe size={13} className="text-slate-500" />
                    <span>{c.country_of_destination || "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm font-medium text-indigo-700">{c.currency}</TableCell>
                <TableCell className="text-sm">{c.port_of_discharge || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-600 hover:bg-slate-100 hover:text-indigo-700"
                      title="Edit"
                      onClick={() => openEdit(c)}
                      disabled={!!panelMode}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
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
                  <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                    No customers yet — add your first consignee above
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
