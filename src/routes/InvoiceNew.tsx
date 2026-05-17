import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Save, CheckCircle } from "lucide-react";
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
import { LineItemsTable } from "@/components/LineItemsTable";
import { invoiceFormSchema, type InvoiceFormSchema } from "@/lib/schemas";
import {
  generateInvoiceNumber,
  createInvoice,
  updateInvoice,
  getInvoice,
} from "@/hooks/useInvoices";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/contexts/AuthContext";
import { type Customer, getCustomers } from "@/lib/customer";
import { Combobox } from "@/components/ui/combobox";
import { UserCheck } from "lucide-react";

export function InvoiceNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { settings } = useSettings();
  const { currentUser } = useAuth();
  const [generatedNumber, setGeneratedNumber] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

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
      currency: "USD",
      exchange_rate: 1,
      net_weight: "",
      gross_weight: "",
      notes: "",
      status: "draft",
      items: [
        {
          sr_no: 1,
          marks_nos: "",
          no_of_pkgs: "",
          dimensions: "",
          part_number: "",
          description: "",
          quantity: 1,
          unit: "NOS",
          unit_price: 0,
          total_amount: 0,
        },
      ],
    },
  });

  const { register, setValue, watch, formState: { errors, isSubmitting } } = form;
  const handleSubmit = form.handleSubmit;
  const currency = watch("currency");

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

  // Load existing invoice for edit
  useEffect(() => {
    if (isEdit && id) {
      getInvoice(Number(id)).then((inv) => {
        if (!inv) return;
        form.reset({
          ...inv,
          items: (inv.items ?? []).map((item) => ({
            sr_no: item.sr_no,
            marks_nos: item.marks_nos,
            no_of_pkgs: item.no_of_pkgs,
            dimensions: item.dimensions,
            part_number: item.part_number,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            total_amount: item.total_amount,
          })),
        });
      });
    }
  }, [isEdit, id, form]);

  // Load customers for selector
  useEffect(() => {
    getCustomers().then(setCustomers);
  }, []);

  function applyCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    const c = customers.find((cu) => String(cu.id) === customerId);
    if (!c) return;
    setValue("consignee_name", c.name);
    setValue("consignee_address", c.address);
    setValue("country_of_destination", c.country_of_destination);
    setValue("port_of_discharge", c.port_of_discharge);
    setValue("final_destination", c.final_destination);
    setValue("currency", c.currency as InvoiceFormSchema["currency"]);
    setValue("pre_carriage_by", c.pre_carriage_by);
    setValue("place_of_receipt", c.place_of_receipt);
    setValue("pre_carrier", c.pre_carrier);
    setValue("port_of_loading", c.port_of_loading);
    if (c.currency === "INR") setValue("exchange_rate", 1);
  }

  // Lock exchange rate to 1 for INR
  useEffect(() => {
    if (currency === "INR") setValue("exchange_rate", 1);
  }, [currency, setValue]);

  async function onSubmit(data: InvoiceFormSchema, finalize = false) {
    try {
      const finalData = { ...data, status: finalize ? "final" as const : data.status };
      if (isEdit && id) {
        await updateInvoice(Number(id), finalData);
        toast.success("Invoice updated");
        navigate(`/invoices/${id}`);
      } else {
        const newId = await createInvoice(finalData, currentUser?.id);
        toast.success(finalize ? "Invoice finalized" : "Invoice saved as draft");
        navigate(`/invoices/${newId}`);
      }
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit((data) => onSubmit(data))} className="p-6 space-y-5 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{isEdit ? "Edit Invoice" : "New Invoice"}</h2>
            {generatedNumber && !isEdit && (
              <p className="text-sm text-muted-foreground mt-0.5">Number: {generatedNumber}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={isSubmitting}>
              <Save size={16} className="mr-1" />
              Save Draft
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit((data) => onSubmit(data, true))}
            >
              <CheckCircle size={16} className="mr-1" />
              Finalize
            </Button>
          </div>
        </div>

        {/* Customer selector — new invoice only */}
        {!isEdit && customers.length > 0 && (
          <Card className="border-dashed overflow-visible">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <UserCheck size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  Load Customer
                </span>
                <Combobox
                  className="flex-1 max-w-sm"
                  value={selectedCustomerId}
                  onValueChange={applyCustomer}
                  placeholder="Search and select a customer…"
                  searchPlaceholder="Type customer name or country…"
                  options={customers.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                    sublabel: [c.country_of_destination, c.currency]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 1: Invoice Header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Field label="Invoice Number *" error={errors.invoice_number?.message}>
              <Input {...register("invoice_number")} readOnly className="bg-muted" />
            </Field>
            <Field label="Invoice Date *" error={errors.invoice_date?.message}>
              <Input type="date" {...register("invoice_date")} />
            </Field>
            <Field label="Transport Mode" error={errors.transport_mode?.message}>
              <Select
                defaultValue="BY SEA"
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
            <Field label="Bank AD Code" error={errors.hs_code?.message}>
              <Input {...register("hs_code")} placeholder="HS Code (84148090)" />
            </Field>
            <Field label="LUT ARN No" error={undefined}>
              <Input placeholder="From Settings" readOnly className="bg-muted text-muted-foreground text-xs" value={settings?.lut_arn_no ?? ""} />
            </Field>
            <Field label="Other Reference(s)" error={errors.other_references?.message}>
              <Input {...register("other_references")} placeholder="NIL" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Currency" error={errors.currency?.message}>
                <Select
                  defaultValue="USD"
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
              <Field label="Exchange Rate" error={errors.exchange_rate?.message}>
                <Input
                  type="number"
                  step="0.0001"
                  {...register("exchange_rate", { valueAsNumber: true })}
                  readOnly={currency === "INR"}
                  className={currency === "INR" ? "bg-muted" : ""}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Consignee & Buyer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consignee &amp; Buyer</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
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
          </CardContent>
        </Card>

        {/* Section 3: Shipping Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shipping Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <Field label="Country of Origin" error={errors.country_of_origin?.message}>
              <Input {...register("country_of_origin")} defaultValue="INDIA" />
            </Field>
            <Field label="Country of Final Destination" error={errors.country_of_destination?.message}>
              <Input {...register("country_of_destination")} placeholder="KOREA" />
            </Field>
            <Field label="Terms of Payment" error={errors.terms_of_payment?.message}>
              <Input {...register("terms_of_payment")} placeholder="90 DAYS FROM DATE OF INVOICE" />
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
          </CardContent>
        </Card>

        {/* Section 4: Line Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Goods &amp; Packing Details</CardTitle>
          </CardHeader>
          <CardContent>
            <LineItemsTable />
          </CardContent>
        </Card>

        {/* Section 5: Weights & Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weight &amp; Notes</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
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
          </CardContent>
        </Card>
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
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
