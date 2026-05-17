import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Save, CheckCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import {
  type POFormValues,
  type POItem,
  generatePONumber,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
} from "@/hooks/usePurchaseOrders";
import { type Customer, getCustomers } from "@/lib/customer";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/hooks/useSettings";

const DEFAULT_ITEM = (): POItem => ({
  sr_no: 1,
  part_number: "",
  description: "",
  quantity: 1,
  unit: "NOS",
  unit_price: 0,
  total_amount: 0,
});

const DEFAULT_FORM: POFormValues = {
  po_number: "",
  po_date: new Date().toISOString().split("T")[0],
  customer_id: null,
  customer_name: "",
  customer_address: "",
  delivery_date: "",
  delivery_address: "",
  payment_terms: "",
  currency: "INR",
  exchange_rate: 1,
  notes: "",
  status: "draft",
  created_by: null,
  items: [DEFAULT_ITEM()],
};

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function PurchaseOrderNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { currentUser } = useAuth();
  const { settings } = useSettings();

  const [form, setForm] = useState<POFormValues>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedNumber, setGeneratedNumber] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Generate PO number for new PO
  useEffect(() => {
    if (!isEdit) {
      generatePONumber().then((num) => {
        setGeneratedNumber(num);
        setForm((f) => ({ ...f, po_number: num }));
      });
    }
  }, [isEdit]);

  // Pre-fill delivery address from company settings
  useEffect(() => {
    if (!isEdit && settings && !form.delivery_address) {
      setForm((f) => ({
        ...f,
        delivery_address: [settings.name, settings.address].filter(Boolean).join("\n"),
      }));
    }
  }, [isEdit, settings]);

  // Load customers
  useEffect(() => {
    getCustomers().then(setCustomers);
  }, []);

  // Load existing PO for edit
  useEffect(() => {
    if (isEdit && id) {
      getPurchaseOrder(Number(id)).then((po) => {
        if (!po) return;
        setForm({
          po_number: po.po_number,
          po_date: po.po_date,
          customer_id: po.customer_id,
          customer_name: po.customer_name,
          customer_address: po.customer_address,
          delivery_date: po.delivery_date,
          delivery_address: po.delivery_address,
          payment_terms: po.payment_terms,
          currency: po.currency,
          exchange_rate: po.exchange_rate,
          notes: po.notes,
          status: po.status,
          created_by: po.created_by,
          items: po.items ?? [DEFAULT_ITEM()],
        });
        if (po.customer_id) setSelectedCustomerId(String(po.customer_id));
      });
    }
  }, [isEdit, id]);

  function set<K extends keyof POFormValues>(field: K, value: POFormValues[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function applyCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    if (!customerId) {
      setForm((f) => ({ ...f, customer_id: null, customer_name: "", customer_address: "" }));
      return;
    }
    const c = customers.find((cu) => String(cu.id) === customerId);
    if (!c) return;
    setForm((f) => ({
      ...f,
      customer_id: c.id,
      customer_name: c.name,
      customer_address: c.address,
    }));
  }

  // Line item helpers
  const updateItem = useCallback((idx: number, field: keyof POItem, value: string | number) => {
    setForm((f) => {
      const items = [...f.items];
      const item = { ...items[idx], [field]: value };
      if (field === "quantity" || field === "unit_price") {
        item.total_amount = Number(item.quantity) * Number(item.unit_price);
      }
      items[idx] = item;
      return { ...f, items };
    });
  }, []);

  function addItem() {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { ...DEFAULT_ITEM(), sr_no: f.items.length + 1 },
      ],
    }));
  }

  function removeItem(idx: number) {
    setForm((f) => ({
      ...f,
      items: f.items
        .filter((_, i) => i !== idx)
        .map((item, i) => ({ ...item, sr_no: i + 1 })),
    }));
  }

  async function handleSubmit(confirm = false) {
    if (!form.customer_name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (form.items.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    setIsSubmitting(true);
    try {
      const finalForm = {
        ...form,
        status: confirm ? ("confirmed" as const) : form.status,
      };
      if (isEdit && id) {
        await updatePurchaseOrder(Number(id), finalForm);
        toast.success("Purchase order updated");
        navigate(`/purchase-orders/${id}`);
      } else {
        const newId = await createPurchaseOrder(finalForm, currentUser?.id);
        toast.success(confirm ? "Purchase order confirmed" : "Purchase order saved as draft");
        navigate(`/purchase-orders/${newId}`);
      }
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalAmount = form.items.reduce((sum, i) => sum + i.total_amount, 0);

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{isEdit ? "Edit Purchase Order" : "New Purchase Order"}</h2>
          {generatedNumber && !isEdit && (
            <p className="text-sm text-muted-foreground mt-0.5">Number: {generatedNumber}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSubmit(false)} disabled={isSubmitting}>
            <Save size={16} className="mr-1" /> Save Draft
          </Button>
          {(!isEdit || form.status === "draft") && (
            <Button onClick={() => handleSubmit(true)} disabled={isSubmitting}>
              <CheckCircle size={16} className="mr-1" /> Confirm PO
            </Button>
          )}
        </div>
      </div>

      {/* PO Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PO Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <Field label="PO Number *">
            <Input
              value={form.po_number}
              onChange={(e) => set("po_number", e.target.value)}
              readOnly
              className="bg-muted"
            />
          </Field>
          <Field label="PO Date *">
            <Input
              type="date"
              value={form.po_date}
              onChange={(e) => set("po_date", e.target.value)}
            />
          </Field>
          <Field label="PO Expiry Date">
            <Input
              type="date"
              value={form.delivery_date}
              onChange={(e) => set("delivery_date", e.target.value)}
            />
          </Field>
          <Field label="Currency">
            <Select
              value={form.currency}
              onValueChange={(v) => { if (v) set("currency", v); }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["INR", "USD", "EUR", "GBP", "AED"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Payment Terms">
            <Input
              placeholder="30 DAYS FROM DATE OF INVOICE"
              value={form.payment_terms}
              onChange={(e) => set("payment_terms", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Customer Details */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="text-base">Customer Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <Field label="Customer Name *">
            <Combobox
              value={selectedCustomerId}
              onValueChange={applyCustomer}
              placeholder="Select a customer…"
              searchPlaceholder="Type customer name or country…"
              options={customers.map((c) => ({
                value: String(c.id),
                label: c.name,
                sublabel: [c.country_of_destination, c.currency].filter(Boolean).join(" · "),
              }))}
            />
          </Field>
          {form.customer_address && (
            <Field label="Customer Address">
              <Textarea
                rows={3}
                value={form.customer_address}
                onChange={(e) => set("customer_address", e.target.value)}
              />
            </Field>
          )}
        </CardContent>
      </Card>

      {/* Delivery */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="Deliver To">
            <Textarea
              rows={3}
              placeholder="Company name and address"
              value={form.delivery_address}
              onChange={(e) => set("delivery_address", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-[2rem_1fr_2fr_5rem_5rem_7rem_7rem_2rem] gap-2 text-xs font-semibold text-muted-foreground px-1">
            <span>Sr.</span>
            <span>Part Number</span>
            <span>Description</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Unit Price</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {form.items.map((item, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[2rem_1fr_2fr_5rem_5rem_7rem_7rem_2rem] gap-2 items-center"
            >
              <span className="text-xs text-muted-foreground text-center">{item.sr_no}</span>
              <Input
                placeholder="Part No."
                value={item.part_number}
                onChange={(e) => updateItem(idx, "part_number", e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateItem(idx, "description", e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                type="number"
                min="0"
                step="any"
                value={item.quantity}
                onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                className="h-8 text-xs"
              />
              <Input
                value={item.unit}
                onChange={(e) => updateItem(idx, "unit", e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                type="number"
                min="0"
                step="any"
                value={item.unit_price}
                onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                className="h-8 text-xs"
              />
              <div className="text-xs text-right font-medium pr-1">
                {item.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                disabled={form.items.length === 1}
                className="text-muted-foreground hover:text-destructive disabled:opacity-20 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addItem}
            className="text-xs mt-1"
          >
            <Plus size={14} className="mr-1" /> Add Row
          </Button>

          <div className="border-t pt-3 flex justify-end">
            <div className="text-right space-y-1">
              <div className="flex items-center gap-8 text-sm">
                <span className="text-muted-foreground font-medium">TOTAL {form.currency}</span>
                <span className="font-bold min-w-24 text-right">
                  {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            placeholder="Additional terms, conditions, or remarks"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
