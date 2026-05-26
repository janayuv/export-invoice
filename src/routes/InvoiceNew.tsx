import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Save,
  CheckCircle,
  UserCheck,
  FileText,
  FilePlus2,
  Users,
  Ship,
  Package,
  Boxes,
  Scale,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GoodsItemsTable, PackingListTable } from "@/components/LineItemsTable";
import { invoiceFormSchema, type InvoiceFormSchema } from "@/lib/schemas";
import {
  generateInvoiceNumber,
  createInvoice,
  updateInvoice,
  getInvoice,
} from "@/hooks/useInvoices";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/contexts/AuthContext";
import { canEditInvoiceByStatus } from "@/lib/auth";
import { type Customer, getCustomer, getCustomers } from "@/lib/customer";
import { mapPurchaseOrderToInvoiceFields } from "@/lib/invoiceFromPo";
import {
  getPurchaseOrder,
  getPurchaseOrdersByCustomerId,
  type PurchaseOrderSummary,
} from "@/hooks/usePurchaseOrders";
import { Combobox } from "@/components/ui/combobox";

const PO_SELECT_NONE = "__none__";

const INCOTERM_OPTIONS: { value: string; label: string }[] = [
  { value: "EXW", label: "EXW — Ex Works" },
  { value: "FCA", label: "FCA — Free Carrier" },
  { value: "FAS", label: "FAS — Free Alongside Ship" },
  { value: "FOB", label: "FOB — Free On Board" },
  { value: "CFR", label: "CFR — Cost and Freight" },
  { value: "CIF", label: "CIF — Cost, Insurance and Freight" },
  { value: "CPT", label: "CPT — Carriage Paid To" },
  { value: "CIP", label: "CIP — Carriage and Insurance Paid To" },
  { value: "DAP", label: "DAP — Delivered at Place" },
  { value: "DPU", label: "DPU — Delivered at Place Unloaded" },
  { value: "DDP", label: "DDP — Delivered Duty Paid" },
];

export function InvoiceNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { settings } = useSettings();
  const { currentUser, can } = useAuth();
  const [editingStatus, setEditingStatus] = useState<"draft" | "final" | null>(null);
  const [generatedNumber, setGeneratedNumber] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerPOs, setCustomerPOs] = useState<PurchaseOrderSummary[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [loadingPOs, setLoadingPOs] = useState(false);
  const editFormLoadedRef = useRef(false);
  const editPickerSyncedRef = useRef(false);
  const originalRowVersionRef = useRef<number>(1);
  const editPickerMetaRef = useRef<{
    purchaseOrderId: number | null;
    consigneeName: string;
  } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<InvoiceFormSchema, any, InvoiceFormSchema>({
    resolver: zodResolver(invoiceFormSchema) as any,
    defaultValues: {
      invoice_number: "",
      invoice_date: new Date().toISOString().split("T")[0],
      transport_mode: "BY SEA",
      buyer_order_no: "",
      duty_drawback: "",
      hs_code: "",
      other_references: "",
      consignee_name: "",
      consignee_address: "",
      buyer_if_other: "",
      country_of_origin: "INDIA",
      country_of_destination: "",
      pre_carriage_by: "",
      place_of_receipt: "",
      pre_carrier: "",
      vessel: "",
      port_of_loading: "",
      port_of_discharge: "",
      final_destination: "",
      terms_of_payment: "",
      incoterm: "",
      currency: "USD",
      exchange_rate: 1,
      net_weight: "",
      gross_weight: "",
      notes: "",
      status: "draft",
      show_sa_number: true,
      purchase_order_id: null,
      items: [
        {
          sr_no: 1,
          marks_nos: "",
          no_of_pkgs: "",
          dimensions: "",
          dimensions_unit: "MM",
          part_number: "",
          sa_number: "",
          description: "",
          quantity: 1,
          unit: "NOS",
          unit_price: 0,
          total_amount: 0,
        },
      ],
      packing_list: [
        {
          sr_no: 1,
          marks_nos: "INZI/ICK/1",
          no_of_pkgs: "1",
          dimensions: "",
          dimensions_unit: "CM",
          net_weight: "",
          gross_weight: "",
        },
      ],
    },
  });

  const { register, setValue, getValues, reset, formState: { errors, isSubmitting } } = form;
  const handleSubmit = form.handleSubmit;
  // useWatch instead of watch() so only these fields trigger a re-render here,
  // not every keystroke in child inputs (e.g. Qty).
  const currency      = useWatch({ control: form.control, name: "currency" }) ?? "USD";
  const transportMode = useWatch({ control: form.control, name: "transport_mode" }) ?? "BY SEA";
  const incoterm      = useWatch({ control: form.control, name: "incoterm" }) ?? "";
  const showSaNumber  = (useWatch({ control: form.control, name: "show_sa_number" }) ?? true) as boolean;

  // Pre-fill invoice number and settings defaults for new invoice
  useEffect(() => {
    if (!isEdit) {
      generateInvoiceNumber().then((num) => {
        setGeneratedNumber(num);
        setValue("invoice_number", num);
      });
    }
  }, [isEdit, setValue]);

  useEffect(() => {
    if (!isEdit && settings) {
      setValue("duty_drawback", settings.bank_ad_code ? "ALL INDUSTRY RATE" : "");
      setValue("hs_code", "");
    }
  }, [isEdit, settings, setValue]);

  // Load existing invoice for edit (form once; pickers when customers are ready)
  useEffect(() => {
    if (!isEdit || !id || editFormLoadedRef.current) return;
    (async () => {
      const inv = await getInvoice(Number(id));
      if (!inv) return;
      originalRowVersionRef.current = inv.row_version;
      if (!currentUser) return;
      if (!canEditInvoiceByStatus(currentUser.role, inv.status)) {
        toast.error(
          inv.status === "final"
            ? "Only administrators can edit finalized invoices"
            : "You do not have permission to edit this invoice"
        );
        navigate(`/invoices/${id}`);
        return;
      }
      setEditingStatus(inv.status);
      reset({
        ...inv,
        purchase_order_id: inv.purchase_order_id ?? null,
        items: (inv.items ?? []).map((item) => ({
          sr_no: item.sr_no,
          marks_nos: item.marks_nos,
          no_of_pkgs: item.no_of_pkgs,
          dimensions: item.dimensions,
          dimensions_unit: item.dimensions_unit ?? "",
          part_number: item.part_number,
          sa_number: item.sa_number,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total_amount: item.total_amount,
        })),
      });
      editFormLoadedRef.current = true;
      editPickerMetaRef.current = {
        purchaseOrderId: inv.purchase_order_id ?? null,
        consigneeName: inv.consignee_name,
      };

      if (inv.purchase_order_id) {
        setSelectedPoId(String(inv.purchase_order_id));
        const po = await getPurchaseOrder(inv.purchase_order_id);
        if (po?.customer_id) {
          setSelectedCustomerId(String(po.customer_id));
          setCustomerPOs(await getPurchaseOrdersByCustomerId(po.customer_id));
          editPickerSyncedRef.current = true;
        }
      }
    })();
  }, [isEdit, id, reset, currentUser, navigate]);

  useEffect(() => {
    if (!isEdit || !id || editPickerSyncedRef.current || !editFormLoadedRef.current) return;
    if (customers.length === 0) return;
    const meta = editPickerMetaRef.current;
    if (!meta) return;

    (async () => {
      if (meta.purchaseOrderId) {
        setSelectedPoId(String(meta.purchaseOrderId));
        const po = await getPurchaseOrder(meta.purchaseOrderId);
        if (po?.customer_id) {
          setSelectedCustomerId(String(po.customer_id));
          setCustomerPOs(await getPurchaseOrdersByCustomerId(po.customer_id));
        }
      } else {
        const match = customers.find((c) => c.name === meta.consigneeName);
        if (match) {
          setSelectedCustomerId(String(match.id));
          setCustomerPOs(await getPurchaseOrdersByCustomerId(match.id));
        }
      }
      editPickerSyncedRef.current = true;
    })();
  }, [isEdit, id, customers]);

  // Load customers for selector
  useEffect(() => {
    getCustomers().then(setCustomers);
  }, []);

  function clearPoDerivedFields() {
    setValue("purchase_order_id", null);
    setValue("buyer_order_no", "");
    setValue("other_references", "");
  }

  async function applyCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setSelectedPoId("");
    clearPoDerivedFields();
    setCustomerPOs([]);

    if (!customerId) return;

    const c = customers.find((cu) => String(cu.id) === customerId);
    if (!c) return;

    setValue("consignee_name", c.name);
    setValue("consignee_address", c.address);
    setValue("port_of_discharge", c.port_of_discharge);
    setValue("final_destination", c.final_destination);
    setValue("currency", c.currency as InvoiceFormSchema["currency"]);
    setValue("pre_carriage_by", c.pre_carriage_by);
    setValue("place_of_receipt", c.place_of_receipt);
    setValue("pre_carrier", c.pre_carrier);
    setValue("port_of_loading", c.port_of_loading);
    if (c.currency === "INR") setValue("exchange_rate", 1);

    setLoadingPOs(true);
    try {
      const pos = await getPurchaseOrdersByCustomerId(c.id);
      setCustomerPOs(pos);
    } catch (e) {
      toast.error(`Error loading purchase orders: ${e}`);
    } finally {
      setLoadingPOs(false);
    }
  }

  async function applyPurchaseOrder(poId: string) {
    if (!poId || poId === PO_SELECT_NONE) {
      setSelectedPoId("");
      clearPoDerivedFields();
      // Revert PO shipping overrides to customer defaults so no stale values remain.
      const c = customers.find((cu) => String(cu.id) === selectedCustomerId);
      if (c) {
        setValue("port_of_discharge", c.port_of_discharge);
        setValue("final_destination", c.final_destination);
      }
      return;
    }

    try {
      const po = await getPurchaseOrder(Number(poId));
      if (!po) {
        toast.error("Purchase order not found");
        return;
      }

      if (po.customer_id != null) {
        const customerKey = String(po.customer_id);
        if (selectedCustomerId !== customerKey) {
          setSelectedCustomerId(customerKey);
          setCustomerPOs(await getPurchaseOrdersByCustomerId(po.customer_id));
        }
      }

      let customer: Customer | null =
        customers.find((c) => c.id === po.customer_id) ?? null;
      if (!customer && po.customer_id) {
        customer = await getCustomer(po.customer_id);
      }

      const mapped = mapPurchaseOrderToInvoiceFields(po, customer);
      const current = getValues();
      reset({
        ...current,
        ...mapped,
        invoice_number: current.invoice_number,
        invoice_date: current.invoice_date,
        transport_mode: current.transport_mode,
        duty_drawback: current.duty_drawback,
        hs_code: current.hs_code,
        country_of_origin: current.country_of_origin,
        vessel: current.vessel,
        net_weight: current.net_weight,
        gross_weight: current.gross_weight,
        status: current.status,
        items: mapped.items ?? current.items,
      });
      setValue("port_of_discharge", mapped.port_of_discharge || '', { shouldDirty: true, shouldTouch: true });
      setValue("final_destination", mapped.final_destination || '', { shouldDirty: true, shouldTouch: true });
      // Force PO-level delivery override (BUSAN / SOUTH KOREA) to take priority over buyer/consignee defaults
      setSelectedPoId(poId);
      toast.success("Loaded invoice fields from purchase order");
    } catch (e) {
      toast.error(`Error loading purchase order: ${e}`);
    }
  }

  // Lock exchange rate to 1 for INR
  useEffect(() => {
    if (currency === "INR") setValue("exchange_rate", 1);
  }, [currency, setValue]);

  async function onSubmit(data: InvoiceFormSchema, finalize = false) {
    const includedItems = data.items
      .filter((item) => item.included !== false)
      .map((item, i) => ({ ...item, sr_no: i + 1 }));

    if (includedItems.length === 0) {
      toast.error("At least one item must be included");
      return;
    }

    try {
      const finalData = {
        ...data,
        status: finalize ? "final" as const : data.status,
        items: includedItems,
      };
      if (isEdit && id) {
        await updateInvoice(Number(id), finalData, originalRowVersionRef.current);
        toast.success("Invoice updated");
        navigate(`/invoices/${id}`);
      } else {
        const newId = await createInvoice(finalData);
        toast.success(finalize ? "Invoice finalized" : "Invoice saved as draft");
        navigate(`/invoices/${newId}`);
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes("ERR_CONFLICT:")) {
        toast.error("This invoice was changed by another session — please reload and re-apply your edits.");
      } else {
        toast.error(`Error: ${msg}`);
      }
    }
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit((data) => onSubmit(data))}
        className="min-h-full bg-muted/30"
      >
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
          <header className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <FilePlus2 className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    {isEdit ? "Edit Invoice" : "New Invoice"}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Commercial export invoice and packing list
                  </p>
                  {generatedNumber && !isEdit && (
                    <span className="mt-2 inline-flex items-center rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
                      {generatedNumber}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  <ArrowLeft size={16} className="mr-1" />
                  Cancel
                </Button>
                <Button type="submit" variant="outline" disabled={isSubmitting}>
                  <Save size={16} className="mr-1" />
                  {isEdit && editingStatus === "final" ? "Save Changes" : "Save Draft"}
                </Button>
                {(!isEdit || editingStatus === "draft") && can("finalize_invoice") && (
                  <Button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSubmit((data) => onSubmit(data, true))}
                  >
                    <CheckCircle size={16} className="mr-1" />
                    Finalize
                  </Button>
                )}
              </div>
            </div>
          </header>

          {/* Customer + purchase order loaders */}
          {customers.length > 0 && (
            <Card className="overflow-visible shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Customer & Purchase Order</CardTitle>
                <CardDescription>Select a customer to prefill shipping details and optionally load a purchase order.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
              <div className="flex flex-wrap items-center gap-3">
                <UserCheck size={16} className="shrink-0 text-primary" />
                <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  Customer
                </span>
                <Combobox
                  className="flex-1 min-w-[200px] max-w-sm"
                  value={selectedCustomerId}
                  onValueChange={(v) => { void applyCustomer(v); }}
                  placeholder="Search and select a customer…"
                  searchPlaceholder="Type customer name or country…"
                  options={customers.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                    sublabel: c.currency,
                  }))}
                />
              </div>
              {selectedCustomerId && (
                <div className="flex flex-wrap items-center gap-3 pl-7">
                  <FileText size={16} className="shrink-0 text-primary" />
                  <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                    Purchase Order
                  </span>
                  <Select
                    value={selectedPoId || PO_SELECT_NONE}
                    onValueChange={(v) => { if (v) void applyPurchaseOrder(v); }}
                    disabled={loadingPOs}
                  >
                    <SelectTrigger className="flex-1 min-w-[260px] max-w-xl">
                      <SelectValue>
                        {(value: string) => {
                          if (loadingPOs) return "Loading purchase orders…";
                          if (!value || value === PO_SELECT_NONE) {
                            return customerPOs.length
                              ? "None — enter manually"
                              : "No purchase orders for this customer";
                          }
                          const po = customerPOs.find((p) => String(p.id) === value);
                          if (!po) return "Loading purchase orders…";
                          return [po.customer_po_no || po.po_number, po.po_date, po.status]
                            .filter(Boolean)
                            .join(" · ");
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      alignItemWithTrigger={false}
                      className="min-w-[var(--anchor-width)] w-auto max-w-[560px]"
                    >
                      <SelectItem value={PO_SELECT_NONE}>None — enter manually</SelectItem>
                      {customerPOs.map((po) => (
                        <SelectItem key={po.id} value={String(po.id)}>
                          {[po.customer_po_no || po.po_number, po.po_date, po.status]
                            .filter(Boolean)
                            .join(" · ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              </CardContent>
            </Card>
          )}

          <FormSectionCard
            icon={FileText}
            title="Invoice Details"
            description="Reference details, currency, and commercial metadata."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Invoice Number *" error={errors.invoice_number?.message}>
              <Input {...register("invoice_number")} readOnly className="bg-muted" />
            </Field>
            <Field label="Invoice Date *" error={errors.invoice_date?.message}>
              <Input type="date" {...register("invoice_date")} />
            </Field>
            <Field label="Transport Mode" error={errors.transport_mode?.message}>
              <Select
                value={transportMode}
                onValueChange={(v) => setValue("transport_mode", v as InvoiceFormSchema["transport_mode"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BY SEA">BY SEA</SelectItem>
                  <SelectItem value="BY AIR">BY AIR</SelectItem>
                  <SelectItem value="BY ROAD">BY ROAD</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Buyer's Order No" error={errors.buyer_order_no?.message}>
              <Input {...register("buyer_order_no")} placeholder="CTRD-20260225-03" />
            </Field>
            <Field label="Duty Drawback" error={errors.duty_drawback?.message}>
              <Input {...register("duty_drawback")} placeholder="ALL INDUSTRY RATE" />
            </Field>
            <Field label="HS Code" error={errors.hs_code?.message}>
              <Input {...register("hs_code")} placeholder="84148090" />
            </Field>
            <Field label="LUT ARN No" error={undefined}>
              <Input placeholder="From Settings" readOnly className="bg-muted text-muted-foreground text-xs" value={settings?.lut_arn_no ?? ""} />
            </Field>
            <Field label="Other Reference(s)" error={errors.other_references?.message}>
              <Input {...register("other_references")} placeholder="NIL" />
            </Field>
              <Field label="Currency" error={errors.currency?.message}>
                <Select
                  value={currency}
                  onValueChange={(v) => setValue("currency", v as InvoiceFormSchema["currency"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD", "EUR", "GBP", "AED", "INR"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FormSectionCard>

          <FormSectionCard
            icon={Users}
            title="Consignee & Buyer"
            description="Maintain consignee and buyer identity exactly as required in shipping documents."
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3">
              <Field label="Consignee Name *" error={errors.consignee_name?.message}>
                <Input {...register("consignee_name")} placeholder="CTR CO.,LTD." />
              </Field>
              <Field label="Consignee Address *" error={errors.consignee_address?.message}>
                <Textarea
                  {...register("consignee_address")}
                  placeholder="# 68-26 Daehapsaneopdanji-ro, Hap-ri,&#10;Daehap-myeon, Korea. Zip Code: 50307"
                  rows={4}
                />
              </Field>
            </div>
              <div className="space-y-3">
              <Field label="Buyer (if other than consignee)" error={errors.buyer_if_other?.message}>
                <Textarea {...register("buyer_if_other")} rows={4} placeholder="Leave blank if same as consignee" />
              </Field>
            </div>
            </div>
          </FormSectionCard>

          <FormSectionCard
            icon={Ship}
            title="Shipping Details"
            description="Port and movement information used in invoice, packing list, and exports."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Country of Origin" error={errors.country_of_origin?.message}>
              <Input {...register("country_of_origin")} defaultValue="INDIA" />
            </Field>
            <Field label="Terms of Payment" error={errors.terms_of_payment?.message}>
              <Input {...register("terms_of_payment")} placeholder="90 DAYS FROM DATE OF INVOICE" />
            </Field>
            <Field label="Incoterm (Delivery)" error={errors.incoterm?.message}>
              <Select
                value={incoterm}
                onValueChange={(v) => setValue("incoterm", v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Incoterm…">
                    {(value: string) => {
                      if (!value) return "Select Incoterm…";
                      const found = INCOTERM_OPTIONS.find((o) => o.value === value);
                      return found ? found.label : value;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className="min-w-[var(--anchor-width)] w-auto max-w-[420px]"
                >
                  {INCOTERM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Pre-Carriage by" error={errors.pre_carriage_by?.message}>
              <Input {...register("pre_carriage_by")} placeholder="BY ROAD" />
            </Field>
            <Field label="Place of Receipt" error={errors.place_of_receipt?.message}>
              <Input {...register("place_of_receipt")} placeholder="CHENNAI" />
            </Field>
            <Field label="Pre-Carrier" error={errors.pre_carrier?.message}>
              <Input {...register("pre_carrier")} placeholder="CHENNAI" />
            </Field>
            <Field label="Vessel" error={errors.vessel?.message}>
              <Input {...register("vessel")} placeholder="Vessel name" />
            </Field>
            <Field label="Port of Loading" error={errors.port_of_loading?.message}>
              <Input {...register("port_of_loading")} placeholder="CHENNAI" />
            </Field>
            <Field label="Port of Discharge" error={errors.port_of_discharge?.message}>
              <Input {...register("port_of_discharge")} placeholder="KOREA" />
            </Field>
            <Field label="Final Destination" error={errors.final_destination?.message}>
              <Input {...register("final_destination")} placeholder="korea" />
            </Field>
            </div>
          </FormSectionCard>

          <FormSectionCard
            icon={Package}
            title="Goods"
            description="Product line items: part number, description, quantity, and rate."
          >
            <div className="mb-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  {...register("show_sa_number")}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Show SA Number column
              </label>
            </div>
            <GoodsItemsTable showSaNumber={showSaNumber} />
          </FormSectionCard>

          <FormSectionCard
            icon={Boxes}
            title="Packing Details"
            description="Per-line packing: marks &amp; numbers, number of packages, and carton dimensions."
          >
            <PackingListTable />
          </FormSectionCard>

          <FormSectionCard
            icon={Scale}
            title="Weight & Notes"
            description="Shipment weight and additional commercial remarks."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Net Weight" error={undefined}>
              <Input {...register("net_weight")} placeholder="405.20 kgs" />
            </Field>
            <Field label="Gross Weight" error={undefined}>
              <Input {...register("gross_weight")} placeholder="420.0 kgs" />
            </Field>
            <div className="col-span-2">
              <Field label="Additional Notes" error={undefined}>
                <Textarea {...register("notes")} rows={3} />
              </Field>
            </div>
            </div>
          </FormSectionCard>
        </div>
      </form>
    </FormProvider>
  );
}

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
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function FormSectionCard({
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
    <Card className="shadow-sm">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1 text-xs">
                {description}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  );
}
