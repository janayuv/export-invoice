import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Save, CheckCircle, Plus, Trash2, FilePlus2, ArrowLeft, UserCheck, ClipboardList, Truck, NotebookPen } from "lucide-react";
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
import { poFormSchema } from "@/lib/schemas";
import { useAuth } from "@/contexts/AuthContext";
import { canEditPurchaseOrderByStatus } from "@/lib/auth";
import { useSettings } from "@/hooks/useSettings";

const PO_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;

const DEFAULT_ITEM = (): POItem => ({
  sr_no: 1,
  part_number: "",
  sa_number: "",
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
  customer_po_no: "",
  delivery_date: "",
  delivery_address: "",
  payment_terms: "",
  currency: "INR",
  exchange_rate: 1,
  notes: "",
  status: "draft",
  show_sa_number: true,
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
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function PurchaseOrderNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { currentUser, can } = useAuth();
  const { settings } = useSettings();

  const [form, setForm] = useState<POFormValues>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedNumber, setGeneratedNumber] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
        if (!currentUser) return;
        if (!canEditPurchaseOrderByStatus(currentUser.role, po.status)) {
          toast.error(
            po.status === "confirmed"
              ? "Only administrators can edit confirmed purchase orders"
              : po.status === "closed"
                ? "Closed purchase orders cannot be edited"
                : "You do not have permission to edit this purchase order"
          );
          navigate(`/purchase-orders/${id}`);
          return;
        }
        setForm({
          po_number: po.po_number,
          po_date: po.po_date,
          customer_id: po.customer_id,
          customer_name: po.customer_name,
          customer_address: po.customer_address,
          customer_po_no: po.customer_po_no,
          delivery_date: po.delivery_date,
          delivery_address: po.delivery_address,
          payment_terms: po.payment_terms,
          currency: po.currency,
          exchange_rate: po.exchange_rate,
          notes: po.notes,
          status: po.status,
          show_sa_number: po.show_sa_number,
          created_by: po.created_by,
          items: po.items ?? [DEFAULT_ITEM()],
        });
        if (po.customer_id) setSelectedCustomerId(String(po.customer_id));
      });
    }
  }, [isEdit, id, currentUser, navigate]);

  function set<K extends keyof POFormValues>(field: K, value: POFormValues[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function applyCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setFieldErrors((e) => {
      const next = { ...e };
      delete next.customer_id;
      delete next.customer_name;
      return next;
    });
    if (!customerId) {
      setForm((f) => ({
        ...f,
        customer_id: null,
        customer_name: "",
        customer_address: "",
      }));
      return;
    }
    const c = customers.find((cu) => String(cu.id) === customerId);
    if (!c) return;
    setForm((f) => {
      const currency = PO_CURRENCIES.includes(c.currency as (typeof PO_CURRENCIES)[number])
        ? c.currency
        : f.currency;
      return {
        ...f,
        customer_id: c.id,
        customer_name: c.name,
        customer_address: c.address,
        currency,
        exchange_rate: currency === "INR" ? 1 : f.exchange_rate,
      };
    });
  }

  useEffect(() => {
    if (form.currency === "INR") {
      setForm((f) => (f.exchange_rate === 1 ? f : { ...f, exchange_rate: 1 }));
    }
  }, [form.currency]);

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

  function validateForm(): POFormValues | null {
    const candidate = {
      ...form,
      created_by: form.created_by ?? null,
    };
    const parsed = poFormSchema.safeParse(candidate);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join(".") || "_form";
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      const first = parsed.error.issues[0]?.message ?? "Please fix the highlighted fields";
      toast.error(first);
      return null;
    }
    setFieldErrors({});
    return parsed.data as POFormValues;
  }

  async function handleSubmit(confirm = false) {
    const validated = validateForm();
    if (!validated) return;

    setIsSubmitting(true);
    try {
      const finalForm: POFormValues = {
        ...validated,
        status: confirm ? "confirmed" : validated.status,
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
    <div className="min-h-full bg-gradient-to-b from-slate-100 via-white to-indigo-50/35">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <header className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm shadow-slate-200/70 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25">
                <FilePlus2 size={18} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  {isEdit ? "Edit Purchase Order" : "New Purchase Order"}
                </h2>
                {generatedNumber && !isEdit && (
                  <p className="mt-1 text-sm text-slate-500">Number: {generatedNumber}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => navigate(-1)} disabled={isSubmitting} className="border-slate-300 text-slate-700">
                <ArrowLeft size={16} className="mr-1" />
                Cancel
              </Button>
              <Button variant="outline" onClick={() => handleSubmit(false)} disabled={isSubmitting} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                <Save size={16} className="mr-1" />
                {isEdit && form.status === "confirmed" ? "Save Changes" : "Save Draft"}
              </Button>
              {(!isEdit || form.status === "draft") && can("finalize_invoice") && (
                <Button onClick={() => handleSubmit(true)} disabled={isSubmitting} className="bg-indigo-600 text-white hover:bg-indigo-700">
                  <CheckCircle size={16} className="mr-1" /> Confirm PO
                </Button>
              )}
            </div>
          </div>
        </header>

        <FormSectionCard
          icon={UserCheck}
          title="Customer"
          description="Select a customer from master records and review linked address details."
          cardClassName="overflow-visible"
        >
          <div className="grid grid-cols-1 gap-4">
          <Field label="Customer *" error={fieldErrors.customer_id ?? fieldErrors.customer_name}>
            <Combobox
              value={selectedCustomerId}
              onValueChange={applyCustomer}
              placeholder="Select a customer from master…"
              searchPlaceholder="Type customer name or country…"
              options={customers.map((c) => ({
                value: String(c.id),
                label: c.name,
                sublabel: [c.country_of_destination, c.currency].filter(Boolean).join(" · "),
              }))}
            />
          </Field>
          {form.customer_id != null && (
            <p className="text-xs text-muted-foreground">
              Linked to customer record #{form.customer_id}
              {form.customer_name ? ` — ${form.customer_name}` : ""}
            </p>
          )}
          {form.customer_address && (
            <Field label="Customer Address">
              <Textarea
                rows={3}
                value={form.customer_address}
                onChange={(e) => set("customer_address", e.target.value)}
              />
            </Field>
          )}
          </div>
        </FormSectionCard>

        <FormSectionCard
          icon={ClipboardList}
          title="Customer PO Details"
          description="Enter the PO number, dates, terms, and currency exactly as on the customer&apos;s purchase order."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Customer PO No *" error={fieldErrors.customer_po_no}>
            <Input
              placeholder="e.g. CTRD-20260225-03"
              value={form.customer_po_no}
              onChange={(e) => set("customer_po_no", e.target.value)}
            />
          </Field>
          <Field label="PO Date *" error={fieldErrors.po_date}>
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
          <Field label="Payment Terms">
            <Input
              placeholder="30 DAYS FROM DATE OF INVOICE"
              value={form.payment_terms}
              onChange={(e) => set("payment_terms", e.target.value)}
            />
          </Field>
          <Field label="Currency *" error={fieldErrors.currency}>
            <Select
              value={form.currency}
              onValueChange={(v) => {
                if (v) {
                  set("currency", v);
                  if (v === "INR") set("exchange_rate", 1);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PO_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Internal PO Ref">
            <Input
              value={form.po_number}
              readOnly
              className="bg-muted"
              title="Auto-generated reference for this application"
            />
          </Field>
          </div>
        </FormSectionCard>

        <FormSectionCard
          icon={Truck}
          title="Delivery Details"
        >
          <Field label="Deliver To">
            <Textarea
              rows={3}
              placeholder="Company name and address"
              value={form.delivery_address}
              onChange={(e) => set("delivery_address", e.target.value)}
            />
          </Field>
        </FormSectionCard>

        <FormSectionCard
          icon={ClipboardList}
          title="Line Items"
          description={`Part number, description, quantity, and unit as stated on the customer PO (${form.currency}).`}
        >
          <div className="space-y-3">
          <div className="mb-1">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.show_sa_number}
                onChange={(e) => set("show_sa_number", e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              Show SA Number column
            </label>
          </div>
          {fieldErrors.items && (
            <p className="text-xs text-destructive">{fieldErrors.items}</p>
          )}
          <div className={`grid ${form.show_sa_number ? "grid-cols-[2rem_6rem_1fr_2fr_5rem_5rem_7rem_7rem_2rem]" : "grid-cols-[2rem_1fr_2fr_5rem_5rem_7rem_7rem_2rem]"} gap-2 rounded-md bg-slate-50 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600`}>
            <span>Sr.</span>
            {form.show_sa_number && <span>SA Number</span>}
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
              className={`grid ${form.show_sa_number ? "grid-cols-[2rem_6rem_1fr_2fr_5rem_5rem_7rem_7rem_2rem]" : "grid-cols-[2rem_1fr_2fr_5rem_5rem_7rem_7rem_2rem]"} items-center gap-2 rounded-md border border-slate-200/80 bg-white px-2 py-2`}
            >
              <span className="text-center text-xs text-slate-500">{item.sr_no}</span>
              {form.show_sa_number && (
                <Input
                  placeholder="SA No."
                  value={item.sa_number}
                  onChange={(e) => updateItem(idx, "sa_number", e.target.value)}
                  className="h-8 text-xs"
                />
              )}
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
                value={String(item.quantity ?? "")}
                onChange={(e) =>
                  updateItem(idx, "quantity", e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)
                }
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
                className="text-slate-500 transition-colors hover:text-rose-600 disabled:opacity-20"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            className="mt-1 border-indigo-200 text-xs text-indigo-700 hover:bg-indigo-50"
          >
            <Plus size={14} className="mr-1" /> Add Row
          </Button>

          <div className="flex justify-end border-t border-slate-200 pt-3">
            <div className="text-right space-y-1">
              <div className="flex items-center gap-8 text-sm">
                <span className="font-medium text-slate-600">TOTAL {form.currency}</span>
                <span className="font-bold min-w-24 text-right">
                  {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
          </div>
        </FormSectionCard>

        <FormSectionCard
          icon={NotebookPen}
          title="Notes"
        >
          <Textarea
            rows={3}
            placeholder="Additional terms, conditions, or remarks"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </FormSectionCard>
      </div>
    </div>
  );
}

function FormSectionCard({
  icon: Icon,
  title,
  description,
  children,
  cardClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  cardClassName?: string;
}) {
  return (
    <Card className={`border-slate-200/80 bg-white shadow-sm ${cardClassName ?? ""}`}>
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base text-slate-900">{title}</CardTitle>
            {description ? (
              <p className="mt-1 text-xs text-slate-500">{description}</p>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  );
}
