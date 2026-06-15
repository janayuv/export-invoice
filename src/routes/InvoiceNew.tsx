import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Save,
  CheckCircle,
  UserCheck,
  FileText,
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
  type POItem,
} from "@/hooks/usePurchaseOrders";
import { Combobox } from "@/components/ui/combobox";
import { clearDraftAutosave, useDraftAutosave } from "@/hooks/useDraftAutosave";
import { cn } from "@/lib/utils";

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

// TOC section definitions (as const preserves literal types)
const TOC_ITEMS = [
  { id: "sec-customerpo", label: "Customer & PO", icon: Users },
  { id: "sec-details", label: "Invoice Details", icon: FileText },
  { id: "sec-consignee", label: "Consignee", icon: UserCheck },
  { id: "sec-shipping", label: "Shipping", icon: Ship },
  { id: "sec-goods", label: "Goods", icon: Package },
  { id: "sec-packing", label: "Packing", icon: Boxes },
  { id: "sec-weight", label: "Weight & Notes", icon: Scale },
] as const;

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
  const [activePOItems, setActivePOItems] = useState<POItem[]>([]);
  const [loadingPOs, setLoadingPOs] = useState(false);
  const editFormLoadedRef = useRef(false);
  const editPickerSyncedRef = useRef(false);
  const originalRowVersionRef = useRef<number>(1);
  const editPickerMetaRef = useRef<{
    purchaseOrderId: number | null;
    consigneeName: string;
  } | null>(null);

  // ── Scroll-tracking refs ────────────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const secCustomerPORef = useRef<HTMLDivElement>(null);
  const secDetailsRef = useRef<HTMLDivElement>(null);
  const secConsigneeRef = useRef<HTMLDivElement>(null);
  const secShippingRef = useRef<HTMLDivElement>(null);
  const secGoodsRef = useRef<HTMLDivElement>(null);
  const secPackingRef = useRef<HTMLDivElement>(null);
  const secWeightRef = useRef<HTMLDivElement>(null);

  const [activeSection, setActiveSection] = useState("sec-customerpo");

  // show_sa_number/packing_list use .default(), so the schema's input type
  // (those fields optional) differs from its parsed output. RHF field state
  // holds the input shape; handleSubmit yields the output (InvoiceFormSchema).
  const form = useForm<z.input<typeof invoiceFormSchema>, unknown, InvoiceFormSchema>({
    resolver: zodResolver(invoiceFormSchema),
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

  const {
    register,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = form;
  const handleSubmit = form.handleSubmit;
  // useWatch instead of watch() so only these fields trigger a re-render here,
  // not every keystroke in child inputs (e.g. Qty).
  const currency = useWatch({ control: form.control, name: "currency" }) ?? "USD";
  const transportMode = useWatch({ control: form.control, name: "transport_mode" }) ?? "BY SEA";
  const incoterm = useWatch({ control: form.control, name: "incoterm" }) ?? "";
  const showSaNumber = (useWatch({ control: form.control, name: "show_sa_number" }) ??
    true) as boolean;
  const invoiceNumber = useWatch({ control: form.control, name: "invoice_number" });
  const formSnapshot = useWatch({ control: form.control });

  const draftKey = isEdit ? `draft:invoice:edit:${id}` : "draft:invoice:new";
  const draftAutosaveEnabled = !isEdit || editingStatus === "draft";

  const restoreDraft = useCallback(
    // Input shape (pre-parse): matches getValues() and reset() field state.
    (data: z.input<typeof invoiceFormSchema>) => {
      reset(data);
      toast.success("Draft restored");
    },
    [reset],
  );

  useDraftAutosave({
    storageKey: draftKey,
    enabled: draftAutosaveEnabled,
    restoreEnabled: !isEdit,
    getValues: () => getValues(),
    onRestore: restoreDraft,
    watchDep: formSnapshot,
  });

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
      if (!canEditInvoiceByStatus(currentUser.permissions ?? [], inv.status)) {
        toast.error(
          inv.status === "final"
            ? "Only administrators can edit finalized invoices"
            : "You do not have permission to edit this invoice",
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

  // Scroll tracking — stable ref array avoids closure issues
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const sections = [
      { id: "sec-customerpo", ref: secCustomerPORef },
      { id: "sec-details", ref: secDetailsRef },
      { id: "sec-consignee", ref: secConsigneeRef },
      { id: "sec-shipping", ref: secShippingRef },
      { id: "sec-goods", ref: secGoodsRef },
      { id: "sec-packing", ref: secPackingRef },
      { id: "sec-weight", ref: secWeightRef },
    ];

    function handleScroll() {
      const containerTop = container!.getBoundingClientRect().top;
      const threshold = containerTop + 80;
      let current = "sec-customerpo";
      for (const { id: secId, ref } of sections) {
        const el = ref.current;
        if (el && el.getBoundingClientRect().top <= threshold) {
          current = secId;
        }
      }
      setActiveSection(current);
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []); // runs once — all section refs are stable

  function scrollToSection(sectionId: string) {
    const refMap: Record<string, React.RefObject<HTMLDivElement | null>> = {
      "sec-customerpo": secCustomerPORef,
      "sec-details": secDetailsRef,
      "sec-consignee": secConsigneeRef,
      "sec-shipping": secShippingRef,
      "sec-goods": secGoodsRef,
      "sec-packing": secPackingRef,
      "sec-weight": secWeightRef,
    };
    refMap[sectionId]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(sectionId);
  }

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
      setActivePOItems([]);
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

      let customer: Customer | null = customers.find((c) => c.id === po.customer_id) ?? null;
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
        items: current.items,
      });
      setValue("port_of_discharge", mapped.port_of_discharge || "", {
        shouldDirty: true,
        shouldTouch: true,
      });
      setValue("final_destination", mapped.final_destination || "", {
        shouldDirty: true,
        shouldTouch: true,
      });
      // Force PO-level delivery override (BUSAN / SOUTH KOREA) to take priority over buyer/consignee defaults
      setActivePOItems(po.items ?? []);
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
      .map((item, i) => ({
        ...item,
        sr_no: i + 1,
        total_amount: Number((item.quantity * item.unit_price).toFixed(2)),
      }));

    if (includedItems.length === 0) {
      toast.error("At least one item must be included");
      return;
    }

    try {
      const finalData = {
        ...data,
        status: finalize ? ("final" as const) : data.status,
        items: includedItems,
      };
      if (isEdit && id) {
        await updateInvoice(Number(id), finalData, originalRowVersionRef.current);
        toast.success("Invoice updated");
        clearDraftAutosave(draftKey);
        navigate(`/invoices/${id}`);
      } else {
        const newId = await createInvoice(finalData);
        toast.success(finalize ? "Invoice finalized" : "Invoice saved as draft");
        clearDraftAutosave(draftKey);
        navigate(`/invoices/${newId}`);
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes("ERR_CONFLICT:")) {
        toast.error(
          "This invoice was changed by another session — please reload and re-apply your edits.",
        );
      } else {
        toast.error(`Error: ${msg}`);
      }
    }
  }

  // Badge shown in the sticky header
  const headerBadge = isEdit ? invoiceNumber : generatedNumber;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit((data) => onSubmit(data))}
        className="flex flex-col h-full overflow-hidden"
      >
        {/* ── Sticky header (56px) ── */}
        <header className="h-14 shrink-0 flex items-center justify-between px-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
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
            <span className="text-[14px] font-bold text-zinc-900 dark:text-zinc-50">
              {isEdit ? "Edit Invoice" : "New Invoice"}
            </span>
            {headerBadge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold bg-indigo-400/15 text-indigo-400">
                {headerBadge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" size="sm" disabled={isSubmitting}>
              <Save size={13} className="mr-1.5" />
              {isEdit && editingStatus === "final" ? "Save Changes" : "Save Draft"}
            </Button>
            {(!isEdit || editingStatus === "draft") && can("finalize_invoice") && (
              <Button
                type="button"
                size="sm"
                disabled={isSubmitting}
                onClick={handleSubmit((data) => onSubmit(data, true))}
              >
                <CheckCircle size={13} className="mr-1.5" />
                Finalize
              </Button>
            )}
          </div>
        </header>

        {/* ── Two-panel body ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: TOC rail (168px fixed) */}
          <nav className="w-[168px] shrink-0 overflow-y-auto bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 py-3 px-2 space-y-0.5">
            {TOC_ITEMS.map(({ id: secId, label, icon: Icon }) => (
              <button
                key={secId}
                type="button"
                onClick={() => scrollToSection(secId)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-[7px] rounded-[6px] text-[12px] text-left transition-colors duration-[80ms]",
                  activeSection === secId
                    ? "bg-indigo-400/15 text-indigo-400 font-semibold"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50",
                )}
              >
                <Icon size={12} className="shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {/* Right: Scrollable form */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-[#0c0c0f] p-[18px] space-y-3"
          >
            {/* §1 — Customer & PO */}
            <SectionCard
              id="sec-customerpo"
              sectionRef={secCustomerPORef}
              icon={Users}
              title="Customer & Purchase Order"
              description="Select a customer to prefill shipping details and optionally load a purchase order."
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-[84px] shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
                    Customer
                  </span>
                  <Combobox
                    className="flex-1 min-w-[200px] max-w-sm"
                    value={selectedCustomerId}
                    onValueChange={(v) => {
                      void applyCustomer(v);
                    }}
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
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-[84px] shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
                      Purchase Order
                    </span>
                    <Select
                      value={selectedPoId || PO_SELECT_NONE}
                      onValueChange={(v) => {
                        if (v) void applyPurchaseOrder(v);
                      }}
                      disabled={loadingPOs}
                    >
                      <SelectTrigger className="flex-1 min-w-[260px] max-w-xl text-[12px] h-8">
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
              </div>
            </SectionCard>

            {/* §2 — Invoice Details */}
            <SectionCard
              id="sec-details"
              sectionRef={secDetailsRef}
              icon={FileText}
              title="Invoice Details"
              description="Reference details, currency, and commercial metadata."
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Invoice Number *" error={errors.invoice_number?.message}>
                  <Input
                    {...register("invoice_number")}
                    readOnly
                    className="opacity-65 font-mono text-[12px] bg-zinc-100 dark:bg-zinc-800"
                  />
                </Field>
                <Field label="Invoice Date *" error={errors.invoice_date?.message}>
                  <Input type="date" {...register("invoice_date")} className="text-[12px]" />
                </Field>
                <Field label="Transport Mode" error={errors.transport_mode?.message}>
                  <Select
                    value={transportMode}
                    onValueChange={(v) =>
                      setValue("transport_mode", v as InvoiceFormSchema["transport_mode"])
                    }
                  >
                    <SelectTrigger className="text-[12px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BY SEA">BY SEA</SelectItem>
                      <SelectItem value="BY AIR">BY AIR</SelectItem>
                      <SelectItem value="BY ROAD">BY ROAD</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Buyer's Order No" error={errors.buyer_order_no?.message}>
                  <Input
                    {...register("buyer_order_no")}
                    placeholder="CTRD-20260225-03"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Duty Drawback" error={errors.duty_drawback?.message}>
                  <Input
                    {...register("duty_drawback")}
                    placeholder="ALL INDUSTRY RATE"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="HS Code" error={errors.hs_code?.message} required>
                  <Input
                    {...register("hs_code")}
                    placeholder="84148090"
                    className="font-mono text-[12px]"
                  />
                </Field>
                <Field label="LUT ARN No" error={undefined}>
                  <Input
                    readOnly
                    placeholder="From Settings"
                    value={settings?.lut_arn_no ?? ""}
                    className="opacity-65 text-[12px] font-mono bg-zinc-100 dark:bg-zinc-800"
                  />
                </Field>
                <Field label="Other Reference(s)" error={errors.other_references?.message}>
                  <Input
                    {...register("other_references")}
                    placeholder="NIL"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Currency" error={errors.currency?.message}>
                  <Select
                    value={currency}
                    onValueChange={(v) => setValue("currency", v as InvoiceFormSchema["currency"])}
                  >
                    <SelectTrigger className="text-[12px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["USD", "EUR", "GBP", "AED", "INR"].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>

            {/* §3 — Consignee & Buyer */}
            <SectionCard
              id="sec-consignee"
              sectionRef={secConsigneeRef}
              icon={UserCheck}
              title="Consignee & Buyer"
              description="Maintain consignee and buyer identity exactly as required in shipping documents."
            >
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="space-y-3">
                  <Field label="Consignee Name *" error={errors.consignee_name?.message}>
                    <Input
                      {...register("consignee_name")}
                      placeholder="CTR CO.,LTD."
                      className="text-[12px]"
                    />
                  </Field>
                  <Field label="Consignee Address *" error={errors.consignee_address?.message}>
                    <Textarea
                      {...register("consignee_address")}
                      placeholder={
                        "# 68-26 Daehapsaneopdanji-ro, Hap-ri,\nDaehap-myeon, Korea. Zip Code: 50307"
                      }
                      rows={4}
                      className="text-[12px] resize-none"
                    />
                  </Field>
                </div>
                <div className="space-y-3">
                  <Field
                    label="Buyer (if other than consignee)"
                    error={errors.buyer_if_other?.message}
                  >
                    <Textarea
                      {...register("buyer_if_other")}
                      rows={4}
                      placeholder="Leave blank if same as consignee"
                      className="text-[12px] resize-none"
                    />
                  </Field>
                </div>
              </div>
            </SectionCard>

            {/* §4 — Shipping Details */}
            <SectionCard
              id="sec-shipping"
              sectionRef={secShippingRef}
              icon={Ship}
              title="Shipping Details"
              description="Port and movement information used in invoice, packing list, and exports."
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Country of Origin" error={errors.country_of_origin?.message}>
                  <Input
                    {...register("country_of_origin")}
                    defaultValue="INDIA"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Terms of Payment" error={errors.terms_of_payment?.message}>
                  <Input
                    {...register("terms_of_payment")}
                    placeholder="90 DAYS FROM DATE OF INVOICE"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Incoterm (Delivery)" error={errors.incoterm?.message} required>
                  <Select value={incoterm} onValueChange={(v) => setValue("incoterm", v ?? "")}>
                    <SelectTrigger className="text-[12px] h-8 w-full">
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
                  <Input
                    {...register("pre_carriage_by")}
                    placeholder="BY ROAD"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Place of Receipt" error={errors.place_of_receipt?.message}>
                  <Input
                    {...register("place_of_receipt")}
                    placeholder="CHENNAI"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Pre-Carrier" error={errors.pre_carrier?.message}>
                  <Input
                    {...register("pre_carrier")}
                    placeholder="CHENNAI"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Vessel" error={errors.vessel?.message}>
                  <Input
                    {...register("vessel")}
                    placeholder="Vessel name"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Port of Loading" error={errors.port_of_loading?.message}>
                  <Input
                    {...register("port_of_loading")}
                    placeholder="CHENNAI"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Port of Discharge" error={errors.port_of_discharge?.message}>
                  <Input
                    {...register("port_of_discharge")}
                    placeholder="KOREA"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Final Destination" error={errors.final_destination?.message}>
                  <Input
                    {...register("final_destination")}
                    placeholder="korea"
                    className="text-[12px]"
                  />
                </Field>
              </div>
            </SectionCard>

            {/* §5 — Goods */}
            <SectionCard
              id="sec-goods"
              sectionRef={secGoodsRef}
              icon={Package}
              title="Goods"
              description="Product line items: part number, description, quantity, and rate."
              headerRight={
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    {...register("show_sa_number")}
                    className="h-3 w-3 accent-indigo-400"
                  />
                  Show SA #
                </label>
              }
            >
              <GoodsItemsTable showSaNumber={showSaNumber} poItems={activePOItems} />
            </SectionCard>

            {/* §6 — Packing Details */}
            <SectionCard
              id="sec-packing"
              sectionRef={secPackingRef}
              icon={Boxes}
              title="Packing Details"
              description="Per-line packing: marks & numbers, number of packages, and carton dimensions."
            >
              <PackingListTable />
            </SectionCard>

            {/* §7 — Weight & Notes */}
            <SectionCard
              id="sec-weight"
              sectionRef={secWeightRef}
              icon={Scale}
              title="Weight & Notes"
              description="Shipment weight and additional commercial remarks."
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Net Weight" error={undefined}>
                  <Input
                    {...register("net_weight")}
                    placeholder="405.20 kgs"
                    className="text-[12px]"
                  />
                </Field>
                <Field label="Gross Weight" error={undefined}>
                  <Input
                    {...register("gross_weight")}
                    placeholder="420.0 kgs"
                    className="text-[12px]"
                  />
                </Field>
                <div className="col-span-full">
                  <Field label="Additional Notes" error={undefined}>
                    <Textarea {...register("notes")} rows={3} className="text-[12px] resize-none" />
                  </Field>
                </div>
              </div>
            </SectionCard>

            {/* Bottom spacer so the last section can scroll flush to the top of the panel */}
            <div className="h-[40vh]" aria-hidden />
          </div>
        </div>
      </form>
    </FormProvider>
  );
}

// ── Helper components ──────────────────────────────────────────────────────────

function Field({
  label,
  children,
  error,
  required,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function SectionCard({
  id,
  sectionRef,
  icon: Icon,
  title,
  description,
  children,
  headerRight,
}: {
  id: string;
  sectionRef: React.RefObject<HTMLDivElement | null>;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  return (
    <div
      id={id}
      ref={sectionRef}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
    >
      {/* Section header */}
      <div className="flex items-start justify-between px-[14px] py-[12px] border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 w-[26px] h-[26px] rounded-[6px] flex items-center justify-center bg-indigo-400/15 text-indigo-400 shrink-0">
            <Icon size={13} />
          </div>
          <div>
            <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
              {title}
            </p>
            {description && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {headerRight && <div className="shrink-0 ml-3 mt-1">{headerRight}</div>}
      </div>
      {/* Section body */}
      <div className="p-[14px]">{children}</div>
    </div>
  );
}
