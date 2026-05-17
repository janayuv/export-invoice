import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InvoiceFormSchema } from "@/lib/schemas";

export function LineItemsTable() {
  const { control, register, setValue, formState: { errors } } = useFormContext<InvoiceFormSchema>();
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  function addRow() {
    append({
      sr_no: fields.length + 1,
      marks_nos: "",
      no_of_pkgs: "",
      dimensions: "",
      part_number: "",
      description: "",
      quantity: 1,
      unit: "NOS",
      unit_price: 0,
      total_amount: 0,
    });
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse border border-border">
          <thead>
            <tr className="bg-muted">
              <Th>Sr.</Th>
              <Th>Marks &amp; Nos</Th>
              <Th>No of Pkgs</Th>
              <Th>Dimensions</Th>
              <Th>Part Number</Th>
              <Th>Description *</Th>
              <Th>Qty *</Th>
              <Th>Unit</Th>
              <Th>Rate (EX WORK)</Th>
              <Th>Amount</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <ItemRow
                key={field.id}
                index={index}
                onRemove={() => remove(index)}
                canRemove={fields.length > 1}
                register={register}
                control={control}
                setValue={setValue}
                errors={errors}
              />
            ))}
          </tbody>
          <tfoot>
            <TotalsFooter control={control} />
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

function ItemRow({
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
  errors: ReturnType<typeof useFormContext<InvoiceFormSchema>>["formState"]["errors"];
}) {
  const qty = useWatch({ control, name: `items.${index}.quantity` });
  const price = useWatch({ control, name: `items.${index}.unit_price` });

  const total = (Number(qty) || 0) * (Number(price) || 0);

  // Update total_amount whenever qty or price changes
  if (total !== useWatch({ control, name: `items.${index}.total_amount` })) {
    setValue(`items.${index}.total_amount`, total, { shouldValidate: false });
  }

  return (
    <tr className="border-b border-border">
      <Td>
        <input
          type="hidden"
          {...register(`items.${index}.sr_no`, { valueAsNumber: true })}
          value={index + 1}
        />
        <span className="px-1 text-muted-foreground">{index + 1}</span>
      </Td>
      <Td>
        <Input className="min-w-[100px] h-8 text-xs" {...register(`items.${index}.marks_nos`)} />
      </Td>
      <Td>
        <Input className="min-w-[90px] h-8 text-xs" {...register(`items.${index}.no_of_pkgs`)} />
      </Td>
      <Td>
        <Input className="min-w-[100px] h-8 text-xs" {...register(`items.${index}.dimensions`)} />
      </Td>
      <Td>
        <Input className="min-w-[100px] h-8 text-xs" {...register(`items.${index}.part_number`)} />
      </Td>
      <Td>
        <Input
          className="min-w-[140px] h-8 text-xs"
          {...register(`items.${index}.description`)}
        />
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
          className="h-7 w-7"
          onClick={onRemove}
          disabled={!canRemove}
        >
          <Trash2 size={13} className="text-destructive" />
        </Button>
      </Td>
    </tr>
  );
}

function TotalsFooter({ control }: { control: ReturnType<typeof useFormContext<InvoiceFormSchema>>["control"] }) {
  const items = useWatch({ control, name: "items" });

  const totalQty = items?.reduce((s, i) => s + (Number(i.quantity) || 0), 0) ?? 0;
  const totalAmt = items?.reduce((s, i) => s + (Number(i.total_amount) || 0), 0) ?? 0;

  return (
    <tr className="bg-muted font-semibold text-sm">
      <Td colSpan={6} className="text-right pr-2">TOTAL</Td>
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
    <th className={`border border-border px-2 py-1.5 text-left font-medium text-xs ${className ?? ""}`}>
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
      className={`border border-border px-1 py-0.5 ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
