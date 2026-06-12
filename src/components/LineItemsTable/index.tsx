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
import type { POItem } from "@/hooks/usePurchaseOrders";

export const DIMENSION_UNITS = ["MM", "CM", "INCH"] as const;

function newRowDefaults(srNo: number) {
  return {
    sr_no: srNo,
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
  };
}

export function GoodsItemsTable({
  showSaNumber = true,
  poItems = [],
}: {
  showSaNumber?: boolean;
  poItems?: POItem[];
}) {
  const { control, register, setValue, formState: { errors } } = useFormContext<InvoiceFormSchema>();
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const incoterm = useWatch({ control, name: "incoterm" });
  const currency = useWatch({ control, name: "currency" });

  function addRow() {
    append(newRowDefaults(fields.length + 1));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <Th className="w-8 text-center">✓</Th>
              <Th>Sr.</Th>
              {showSaNumber && <Th>SA Number</Th>}
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
                showSaNumber={showSaNumber}
                poItems={poItems}
              />
            ))}
          </tbody>
          <tfoot>
            <GoodsTotalsFooter control={control} showSaNumber={showSaNumber} />
          </tfoot>
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <PlusCircle size={14} className="mr-1" />
        Add Row
      </Button>

      {errors.items && typeof errors.items === "object" && "message" in errors.items && (
        <p className="text-xs text-destructive">{errors.items.message as string}</p>
      )}
    </div>
  );
}

export function PackingListTable() {
  const { control, register, setValue } = useFormContext<InvoiceFormSchema>();
  const { fields, append, remove } = useFieldArray({ control, name: "packing_list" });

  function addRow() {
    append({
      sr_no: fields.length + 1,
      marks_nos: "",
      no_of_pkgs: "",
      dimensions: "",
      dimensions_unit: "CM",
      net_weight: "",
      gross_weight: "",
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <Th>Sr.</Th>
              <Th>Marks &amp; Nos</Th>
              <Th>No of Pkgs</Th>
              <Th>Dimensions</Th>
              <Th>Unit</Th>
              <Th>Net Wt</Th>
              <Th>Gross Wt</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <PackingListRow
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
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <PlusCircle size={14} className="mr-1" />
        Add Row
      </Button>
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
  showSaNumber,
  poItems = [],
}: {
  index: number;
  onRemove: () => void;
  canRemove: boolean;
  register: ReturnType<typeof useFormContext<InvoiceFormSchema>>["register"];
  control: ReturnType<typeof useFormContext<InvoiceFormSchema>>["control"];
  setValue: ReturnType<typeof useFormContext<InvoiceFormSchema>>["setValue"];
  showSaNumber: boolean;
  poItems?: POItem[];
}) {
  // Only subscribe to `included` — the checkbox flag that dims the row.
  // qty/price are uncontrolled inputs; totals are computed in RowTotal via
  // useWatch so no setValue is called during typing, preventing re-renders
  // that would reset the input value between keystrokes.
  const included = useWatch({ control, name: `items.${index}.included` });

  return (
    <tr className={`border-b border-border last:border-b-0 transition-opacity ${included === false ? "opacity-40" : ""}`}>
      <Td className="text-center">
        <input
          type="checkbox"
          checked={included !== false}
          onChange={(e) =>
            setValue(`items.${index}.included`, e.target.checked, { shouldValidate: false })
          }
          className="h-3.5 w-3.5 accent-primary"
        />
      </Td>
      <Td>
        <input
          type="hidden"
          {...register(`items.${index}.sr_no`, { valueAsNumber: true })}
          value={index + 1}
        />
        <span className="px-1 text-muted-foreground">{index + 1}</span>
      </Td>
      {showSaNumber && (
        <Td>
          <Input className="w-24 h-8 text-xs" {...register(`items.${index}.sa_number`)} />
        </Td>
      )}
      <Td>
        {poItems.some((p) => p.part_number.trim() !== "") ? (
          <PartDropdown index={index} poItems={poItems} control={control} setValue={setValue} />
        ) : (
          <Input className="min-w-[100px] h-8 text-xs" {...register(`items.${index}.part_number`)} />
        )}
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
      {/* RowTotal is a separate component so only it re-renders when total_amount
          changes — the inputs above are never touched during that re-render. */}
      <Td className="text-right font-medium pr-2">
        <RowTotal control={control} index={index} />
      </Td>
      <Td>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-destructive/10"
          onClick={onRemove}
          disabled={!canRemove}
        >
          <Trash2 size={13} className="text-destructive" />
        </Button>
      </Td>
    </tr>
  );
}

// Isolated subscriber for a single row's computed total.
// Re-renders only when total_amount changes; parent GoodsRow is not touched.
function RowTotal({
  control,
  index,
}: {
  control: ReturnType<typeof useFormContext<InvoiceFormSchema>>["control"];
  index: number;
}) {
  const qty   = useWatch({ control, name: `items.${index}.quantity` });
  const price = useWatch({ control, name: `items.${index}.unit_price` });
  const total = (Number(qty) || 0) * (Number(price) || 0);
  return (
    <>
      {total.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </>
  );
}

function PartDropdown({
  index,
  poItems,
  control,
  setValue,
}: {
  index: number;
  poItems: POItem[];
  control: ReturnType<typeof useFormContext<InvoiceFormSchema>>["control"];
  setValue: ReturnType<typeof useFormContext<InvoiceFormSchema>>["setValue"];
}) {
  const currentValue = useWatch({ control, name: `items.${index}.part_number` });
  const options = poItems.filter((p) => p.part_number.trim() !== "");

  function handleSelect(partNumber: string | null) {
    if (!partNumber) return;
    const item = options.find((p) => p.part_number === partNumber);
    setValue(`items.${index}.part_number`, partNumber);
    if (item) {
      setValue(`items.${index}.sa_number`, item.sa_number);
      setValue(`items.${index}.description`, item.description);
      setValue(`items.${index}.quantity`, item.quantity, { shouldValidate: true });
      setValue(`items.${index}.unit`, item.unit);
      setValue(`items.${index}.unit_price`, item.unit_price, { shouldValidate: true });
      setValue(`items.${index}.total_amount`, item.total_amount);
    }
  }

  return (
    <Select value={currentValue ?? ""} onValueChange={handleSelect}>
      <SelectTrigger className="min-w-[120px] h-8 text-xs">
        <SelectValue placeholder="Select part…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((item) => (
          <SelectItem key={item.sr_no} value={item.part_number}>
            {item.part_number}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PackingListRow({
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
  const dimensionsUnit = useWatch({ control, name: `packing_list.${index}.dimensions_unit` });

  return (
    <tr className="border-b border-border last:border-b-0">
      <Td>
        <span className="px-1 text-muted-foreground">{index + 1}</span>
      </Td>
      <Td>
        <Input className="min-w-[140px] h-8 text-xs" {...register(`packing_list.${index}.marks_nos`)} />
      </Td>
      <Td>
        <Input className="w-20 h-8 text-xs" {...register(`packing_list.${index}.no_of_pkgs`)} />
      </Td>
      <Td>
        <Input className="min-w-[130px] h-8 text-xs" {...register(`packing_list.${index}.dimensions`)} placeholder="60×40×30" />
      </Td>
      <Td>
        <Select
          value={dimensionsUnit || ""}
          onValueChange={(v) => setValue(`packing_list.${index}.dimensions_unit`, v ?? "")}
        >
          <SelectTrigger className="h-8 w-20 text-xs">
            <SelectValue placeholder="Unit" />
          </SelectTrigger>
          <SelectContent>
            {DIMENSION_UNITS.map((u) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Td>
      <Td>
        <Input className="w-24 h-8 text-xs" {...register(`packing_list.${index}.net_weight`)} placeholder="12.5 KGS" />
      </Td>
      <Td>
        <Input className="w-24 h-8 text-xs" {...register(`packing_list.${index}.gross_weight`)} placeholder="14.0 KGS" />
      </Td>
      <Td>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-destructive/10"
          onClick={onRemove}
          disabled={!canRemove}
        >
          <Trash2 size={13} className="text-destructive" />
        </Button>
      </Td>
    </tr>
  );
}

function GoodsTotalsFooter({ control, showSaNumber }: { control: ReturnType<typeof useFormContext<InvoiceFormSchema>>["control"]; showSaNumber: boolean }) {
  const items = useWatch({ control, name: "items" });

  const includedItems = items?.filter((i) => i.included !== false) ?? [];
  const totalQty = includedItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalAmt = includedItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);

  return (
    <tr className="bg-muted/50 font-semibold text-sm text-foreground">
      <Td colSpan={showSaNumber ? 5 : 4} className="text-right pr-2">TOTAL</Td>
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
    <th className={`border border-border px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ""}`}>
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
      className={`border border-border px-1 py-1 ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
