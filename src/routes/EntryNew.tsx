import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { toast } from "@/lib/toast";
import {
  Save,
  ArrowLeft,
  UserCheck,
  FileText,
  Package,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/AuthContext";
import { type Customer, getCustomers } from "@/lib/customer";
import { getInvoice } from "@/hooks/useInvoices";
import { getPurchaseOrder } from "@/hooks/usePurchaseOrders";
import {
  createEntry,
  updateEntry,
  getEntry,
  getInvoicesByCustomerId,
  type InvoiceForCustomer,
} from "@/hooks/useEntries";
import { fmtAmount } from "@/lib/invoiceDocument";
import type { EntryFormValues, EntryItem } from "@/lib/types";

const EMPTY_DEFAULTS: EntryFormValues = {
  customer_id: null,
  invoice_id: null,
  purchase_order_id: null,
  customer_name: "",
  customer_address: "",
  invoice_number: "",
  invoice_date: "",
  po_number: "",
  po_date: "",
  customer_po_no: "",
  currency: "USD",
  exchange_rate: 1,
  invoice_total: 0,
  items: [],
  local_invoice_no: "",
  local_invoice_date: "",
  shipping_bill_no: "",
  shipping_bill_date: "",
  bl_awb_no: "",
  bl_awb_date: "",
  status: "draft",
};

export function EntryNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { currentUser } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceForCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [items, setItems] = useState<EntryItem[]>([]);
  const editLoadedRef = useRef(false);
  const originalRowVersionRef = useRef<number>(1);

  const form = useForm<EntryFormValues>({ defaultValues: EMPTY_DEFAULTS });
  const { register, setValue, reset, watch, formState: { isSubmitting } } = form;

  const poNumber = watch("po_number");
  const poDate = watch("po_date");
  const invoiceTotal = watch("invoice_total");
  const currency = watch("currency");

  // Load customers for the selector.
  useEffect(() => {
    getCustomers().then(setCustomers);
  }, []);

  // Load an existing entry for edit (once).
  useEffect(() => {
    if (!isEdit || !id || editLoadedRef.current) return;
    (async () => {
      const entry = await getEntry(Number(id));
      if (!entry) {
        toast.error("Entry not found");
        navigate("/entries");
        return;
      }
      originalRowVersionRef.current = entry.row_version;
      reset({
        customer_id: entry.customer_id,
        invoice_id: entry.invoice_id,
        purchase_order_id: entry.purchase_order_id,
        customer_name: entry.customer_name,
        customer_address: entry.customer_address,
        invoice_number: entry.invoice_number,
        invoice_date: entry.invoice_date,
        po_number: entry.po_number,
        po_date: entry.po_date,
        customer_po_no: entry.customer_po_no,
        currency: entry.currency,
        exchange_rate: entry.exchange_rate,
        invoice_total: entry.invoice_total,
        items: entry.items ?? [],
        local_invoice_no: entry.local_invoice_no,
        local_invoice_date: entry.local_invoice_date,
        shipping_bill_no: entry.shipping_bill_no,
        shipping_bill_date: entry.shipping_bill_date,
        bl_awb_no: entry.bl_awb_no,
        bl_awb_date: entry.bl_awb_date,
        status: entry.status,
      });
      setItems(entry.items ?? []);
      editLoadedRef.current = true;
      if (entry.customer_id != null) {
        setSelectedCustomerId(String(entry.customer_id));
        setInvoices(await getInvoicesByCustomerId(entry.customer_id, Number(id)));
      }
      if (entry.invoice_id != null) setSelectedInvoiceId(String(entry.invoice_id));
    })();
  }, [isEdit, id, reset, navigate]);

  async function applyCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setSelectedInvoiceId("");
    setInvoices([]);
    setItems([]);
    // Reset invoice/PO-derived fields when the customer changes.
    setValue("invoice_id", null);
    setValue("purchase_order_id", null);
    setValue("invoice_number", "");
    setValue("invoice_date", "");
    setValue("po_number", "");
    setValue("po_date", "");
    setValue("customer_po_no", "");
    setValue("invoice_total", 0);
    setValue("items", []);

    if (!customerId) {
      setValue("customer_id", null);
      setValue("customer_name", "");
      setValue("customer_address", "");
      return;
    }

    const c = customers.find((cu) => String(cu.id) === customerId);
    if (!c) return;
    setValue("customer_id", c.id);
    setValue("customer_name", c.name);
    setValue("customer_address", c.address);

    try {
      setInvoices(await getInvoicesByCustomerId(c.id, isEdit && id ? Number(id) : null));
    } catch (e) {
      toast.error(`Error loading invoices: ${e}`);
    }
  }

  async function applyInvoice(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    if (!invoiceId) {
      setItems([]);
      setValue("invoice_id", null);
      setValue("invoice_number", "");
      setValue("invoice_date", "");
      setValue("po_number", "");
      setValue("po_date", "");
      setValue("customer_po_no", "");
      setValue("purchase_order_id", null);
      setValue("invoice_total", 0);
      setValue("items", []);
      return;
    }

    try {
      const inv = await getInvoice(Number(invoiceId));
      if (!inv) {
        toast.error("Invoice not found");
        return;
      }

      const lineItems: EntryItem[] = (inv.items ?? []).map((it) => ({
        part_number: it.part_number,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        total_amount: it.total_amount,
      }));
      const total = lineItems.reduce((sum, it) => sum + it.total_amount, 0);

      setValue("invoice_id", inv.id);
      setValue("invoice_number", inv.invoice_number);
      setValue("invoice_date", inv.invoice_date);
      setValue("currency", inv.currency);
      setValue("exchange_rate", inv.exchange_rate);
      setValue("invoice_total", total);
      setValue("items", lineItems);
      setItems(lineItems);

      // PO No / PO Date come from the invoice's linked purchase order.
      if (inv.purchase_order_id) {
        setValue("purchase_order_id", inv.purchase_order_id);
        const po = await getPurchaseOrder(inv.purchase_order_id);
        if (po) {
          setValue("po_number", po.po_number);
          setValue("po_date", po.po_date);
          setValue("customer_po_no", po.customer_po_no);
        }
      } else {
        setValue("purchase_order_id", null);
        setValue("po_number", "");
        setValue("po_date", "");
        setValue("customer_po_no", inv.buyer_order_no ?? "");
      }
      toast.success("Loaded invoice and PO details");
    } catch (e) {
      toast.error(`Error loading invoice: ${e}`);
    }
  }

  async function onSubmit(data: EntryFormValues) {
    if (!data.customer_id) {
      toast.error("Select a customer");
      return;
    }
    if (!data.invoice_id) {
      toast.error("Select an invoice");
      return;
    }
    try {
      if (isEdit && id) {
        await updateEntry(Number(id), data, originalRowVersionRef.current);
        toast.success("Entry updated");
      } else {
        await createEntry(data, currentUser?.id);
        toast.success("Entry saved");
      }
      navigate("/entries");
    } catch (e) {
      const msg = String(e);
      if (msg.includes("ERR_CONFLICT:")) {
        toast.error("This entry was changed by another session — please reload and re-apply your edits.");
      } else {
        toast.error(`Error: ${msg}`);
      }
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="p-[18px] space-y-3 animate-fade-up max-w-5xl mx-auto"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeft size={15} />
          </Button>
          <div>
            <h1 className="text-[20px] font-bold text-zinc-900 dark:text-zinc-50">
              {isEdit ? "Edit Entry" : "New Entry"}
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Export entry linking a customer, invoice, and shipping references
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            <Save size={13} className="mr-1.5" />
            {isEdit ? "Save Changes" : "Save Entry"}
          </Button>
        </div>
      </header>

        {/* Customer + invoice selectors */}
        <SectionCard icon={UserCheck} title="Customer & Invoice" description="Select a customer, then an invoice to auto-fill PO and goods details.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-medium text-muted-foreground">Customer</span>
              <Combobox
                className="flex-1 min-w-[200px] max-w-sm"
                value={selectedCustomerId}
                onValueChange={(v) => { void applyCustomer(v); }}
                placeholder="Search and select a customer…"
                searchPlaceholder="Type customer name…"
                options={customers.map((c) => ({
                  value: String(c.id),
                  label: c.name,
                  sublabel: c.currency,
                }))}
              />
            </div>
            {selectedCustomerId && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-24 shrink-0 text-sm font-medium text-muted-foreground">Invoice</span>
                <Combobox
                  className="flex-1 min-w-[200px] max-w-sm"
                  value={selectedInvoiceId}
                  onValueChange={(v) => { void applyInvoice(v); }}
                  placeholder={invoices.length ? "Select an invoice…" : "No invoices for this customer"}
                  searchPlaceholder="Type invoice number…"
                  options={invoices.map((i) => ({
                    value: String(i.id),
                    label: i.invoice_number,
                    sublabel: i.invoice_date,
                  }))}
                />
              </div>
            )}
          </div>
        </SectionCard>

        {/* Auto-filled reference details */}
        <SectionCard icon={FileText} title="Auto-filled Details" description="Pulled from the selected invoice and its purchase order.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ReadonlyField label="PO No" value={poNumber} />
            <ReadonlyField label="PO Date" value={poDate} />
            <ReadonlyField label="Invoice Total" value={`${fmtAmount(invoiceTotal || 0)} ${currency}`} />
          </div>
        </SectionCard>

        {/* Auto-filled goods */}
        <SectionCard icon={Package} title="Goods" description="Line items copied from the selected invoice.">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Sr.</TableHead>
                  <TableHead>Part No</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Select an invoice to load goods
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{it.part_number || "—"}</TableCell>
                      <TableCell>{it.description}</TableCell>
                      <TableCell className="text-right">{it.quantity} {it.unit}</TableCell>
                      <TableCell className="text-right">{fmtAmount(it.unit_price)}</TableCell>
                      <TableCell className="text-right">{fmtAmount(it.total_amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </SectionCard>

        {/* Manual export references */}
        <SectionCard icon={ClipboardList} title="Export References" description="Manually entered exchange rate and shipping references.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Ex. Rate">
              <Input type="number" step="0.0001" {...register("exchange_rate", { valueAsNumber: true })} />
            </Field>
            <Field label="Local Invoice No">
              <Input {...register("local_invoice_no")} placeholder="Local invoice number" />
            </Field>
            <Field label="Local Invoice Date">
              <Input type="date" {...register("local_invoice_date")} />
            </Field>
            <Field label="Shipping Bill No">
              <Input {...register("shipping_bill_no")} placeholder="Shipping bill number" />
            </Field>
            <Field label="Shipping Bill Date">
              <Input type="date" {...register("shipping_bill_date")} />
            </Field>
            <div className="hidden xl:block" />
            <Field label="BL / AWB No">
              <Input {...register("bl_awb_no")} placeholder="BL / AWB number" />
            </Field>
            <Field label="BL / AWB Date">
              <Input type="date" {...register("bl_awb_date")} />
            </Field>
          </div>
        </SectionCard>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <Input readOnly value={value || ""} className="bg-muted" placeholder="—" />
    </Field>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-visible shadow-sm">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1 text-xs">{description}</CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  );
}
