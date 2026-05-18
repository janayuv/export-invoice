import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InvoiceFormSchema } from "@/lib/schemas";
import { rateColumnLabel } from "@/lib/invoiceDocument";

export const DIMENSION_UNITS = ["MM", "CM", "INCH"] as const;

function newRowDefaults(srNo: number) {
  return {
    sr_no: srNo,
    marks_nos: "",
    no_of_pkgs: "",
    dimensions: "",
    dimensions_unit: "MM",
    part_number: "",
    description: "",
    quantity: 1,
    unit: "NOS",
    unit_price: 0,
    total_amount: 0,
  };
}

export function GoodsItemsTable() {
  const { control, register, setValue, formState: { errors } } = useFormContext<InvoiceFormSchema>();
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const incoterm = useWatch({ control, name: "incoterm" });
  const currency = useWatch({ control, name: "currency" });

  function addRow() {
    append(newRowDefaults(fields.length + 1));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50/90">
              <Th>Sr.</Th>
              <Th>Part Number</Th>
              <Th>Description *</Th>
              <Th>Qty *</Th>
              <Th>Unit</Th>
              <Th>{rateColumnLabel(incoterm ?? "", currency ?? "USD")}</Th>
              <Th>Amount</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <GoodsRow
                key={field.id}
                index={index}
                onRemove={() => remove(index)}
                canRemove={fields.length > 1}
                register={register}
                control={control}
                setValue={setValue}
              />
            ))}
          </tbody>
          <tfoot>
            <GoodsTotalsFooter control={control} />
          </tfoot>
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
        <PlusCircle size={14} className="mr-1" />
        Add Row
      </Button>

      {errors.items && typeof errors.items === "object" && "message" in errors.items && (
        <p className="text-xs text-destructive">{errors.items.message as string}</p>
      )}
    </div>
  );
}

export function PackingItemsTable() {
  const { control, register, setValue } = useFormContext<InvoiceFormSchema>();
  const { fields } = useFieldArray({ control, name: "items" });

  if (fields.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Add a line item in Goods to enter packing details.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50/90">
            <Th>Sr.</Th>
            <Th>Marks &amp; Nos</Th>
            <Th>No of Pkgs</Th>
            <Th>Dimensions</Th>
            <Th>Unit</Th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => (
            <PackingRow
              key={field.id}
              index={index}
              register={register}
              control={control}
              setValue={setValue}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GoodsRow({
  index,
  onRemove,
  canRemove,
  register,
  control,
  setValue,
}: {
  index: number;
  onRemove: () => void;
  canRemove: boolean;
  register: ReturnType<typeof useFormContext<InvoiceFormSchema>>["register"];
  control: ReturnType<typeof useFormContext<InvoiceFormSchema>>["control"];
  setValue: ReturnType<typeof useFormContext<InvoiceFormSchema>>["setValue"];
}) {
  const qty = useWatch({ control, name: `items.${index}.quantity` });
  const price = useWatch({ control, name: `items.${index}.unit_price` });

  const total = (Number(qty) || 0) * (Number(price) || 0);

  if (total !== useWatch({ control, name: `items.${index}.total_amount` })) {
    setValue(`items.${index}.total_amount`, total, { shouldValidate: false });
  }

  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <Td>
        <input
          type="hidden"
          {...register(`items.${index}.sr_no`, { valueAsNumber: true })}
          value={index + 1}
        />
        <span className="px-1 text-slate-500">{index + 1}</span>
      </Td>
      <Td>
        <Input className="min-w-[100px] h-8 text-xs" {...register(`items.${index}.part_number`)} />
      </Td>
      <Td>
        <Input className="min-w-[180px] h-8 text-xs" {...register(`items.${index}.description`)} />
      </Td>
      <Td>
        <Input
          className="w-20 h-8 text-xs text-right"
          type="number"
          step="0.001"
          {...register(`items.${index}.quantity`, { valueAsNumber: true })}
        />
      </Td>
      <Td>
        <Input className="w-16 h-8 text-xs" {...register(`items.${index}.unit`)} />
      </Td>
      <Td>
        <Input
          className="w-24 h-8 text-xs text-right"
          type="number"
          step="0.001"
          {...register(`items.${index}.unit_price`, { valueAsNumber: true })}
        />
      </Td>
      <Td className="text-right font-medium pr-2">
        {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Td>
      <Td>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-rose-50"
          onClick={onRemove}
          disabled={!canRemove}
        >
          <Trash2 size={13} className="text-destructive" />
        </Button>
      </Td>
    </tr>
  );
}

function PackingRow({
  index,
  register,
  control,
  setValue,
}: {
  index: number;
  register: ReturnType<typeof useFormContext<InvoiceFormSchema>>["register"];
  control: ReturnType<typeof useFormContext<InvoiceFormSchema>>["control"];
  setValue: ReturnType<typeof useFormContext<InvoiceFormSchema>>["setValue"];
}) {
  const dimensionsUnit = useWatch({ control, name: `items.${index}.dimensions_unit` });

  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <Td>
        <span className="px-1 text-slate-500">{index + 1}</span>
      </Td>
      <Td>
        <Input className="min-w-[140px] h-8 text-xs" {...register(`items.${index}.marks_nos`)} />
      </Td>
      <Td>
        <Input className="min-w-[100px] h-8 text-xs" {...register(`items.${index}.no_of_pkgs`)} />
      </Td>
      <Td>
        <Input className="min-w-[140px] h-8 text-xs" {...register(`items.${index}.dimensions`)} placeholder="60×40×30" />
      </Td>
      <Td>
        <Select
          value={dimensionsUnit || ""}
          onValueChange={(v) => setValue(`items.${index}.dimensions_unit`, v ?? "")}
        >
          <SelectTrigger className="h-8 w-24 text-xs">
            <SelectValue placeholder="Unit" />
          </SelectTrigger>
          <SelectContent>
            {DIMENSION_UNITS.map((u) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Td>
    </tr>
  );
}

function GoodsTotalsFooter({ control }: { control: ReturnType<typeof useFormContext<InvoiceFormSchema>>["control"] }) {
  const items = useWatch({ control, name: "items" });

  const totalQty = items?.reduce((s, i) => s + (Number(i.quantity) || 0), 0) ?? 0;
  const totalAmt = items?.reduce((s, i) => s + (Number(i.total_amount) || 0), 0) ?? 0;

  return (
    <tr className="bg-slate-50 font-semibold text-sm text-slate-700">
      <Td colSpan={3} className="text-right pr-2">TOTAL</Td>
      <Td className="text-right pr-1">
        {totalQty.toLocaleString("en-US", { maximumFractionDigits: 3 })}
      </Td>
      <Td></Td>
      <Td></Td>
      <Td className="text-right pr-2">
        {totalAmt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Td>
      <Td></Td>
    </tr>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border border-slate-200/80 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 ${className ?? ""}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  colSpan,
  className,
}: {
  children?: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-slate-200/80 px-1 py-1 ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
