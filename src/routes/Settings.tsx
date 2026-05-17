import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/useSettings";
import { companySettingsSchema, type CompanySettingsFormValues } from "@/lib/schemas";

export function Settings() {
  const { settings, loading, saveSettings } = useSettings();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<CompanySettingsFormValues, any, CompanySettingsFormValues>({
    resolver: zodResolver(companySettingsSchema) as any,
  });

  useEffect(() => {
    if (settings) reset(settings);
  }, [settings, reset]);

  const onSubmit = async (data: CompanySettingsFormValues) => {
    try {
      await saveSettings(data);
      toast.success("Settings saved successfully");
    } catch (e) {
      toast.error(`Failed to save: ${e}`);
    }
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Company Settings</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Exporter details printed on every invoice
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exporter Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Company Name *" error={errors.name?.message}>
              <Input {...register("name")} placeholder="INZI CONTROLS INDIA LIMITED" />
            </Field>
            <Field label="Address *" error={errors.address?.message}>
              <Textarea
                {...register("address")}
                placeholder="SF 72 BANGALORE HIGHWAYS IRRUNGATTUKOTTAI&#10;VILLAGE, SRIPERUMBUDUR"
                rows={3}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="GSTIN" error={errors.gstin?.message}>
                <Input {...register("gstin")} placeholder="33AAACP5832C1ZW" />
              </Field>
              <Field label="PAN" error={errors.pan?.message}>
                <Input {...register("pan")} placeholder="AAACP5832C" />
              </Field>
            </div>
            <Field label="IEC Code" error={errors.iec?.message}>
              <Input {...register("iec")} placeholder="IEC Code" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Banking & Export Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bank Name" error={errors.bank_name?.message}>
                <Input {...register("bank_name")} />
              </Field>
              <Field label="Bank Account No" error={errors.bank_account?.message}>
                <Input {...register("bank_account")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="IFSC Code" error={errors.ifsc?.message}>
                <Input {...register("ifsc")} />
              </Field>
              <Field label="SWIFT Code" error={errors.swift?.message}>
                <Input {...register("swift")} />
              </Field>
            </div>
            <Field label="Bank AD Code" error={errors.bank_ad_code?.message}>
              <Input {...register("bank_ad_code")} placeholder="6850001" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="LUT ARN No" error={errors.lut_arn_no?.message}>
                <Input {...register("lut_arn_no")} placeholder="AD330426032163J" />
              </Field>
              <Field label="LUT ARN Date" error={errors.lut_arn_date?.message}>
                <Input {...register("lut_arn_date")} type="date" />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signatory Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Place (for signature)" error={errors.place?.message}>
                <Input {...register("place")} placeholder="IRRUNGATTUKOTTAI" />
              </Field>
              <Field label="Authorised Signatory Name" error={errors.signatory_name?.message}>
                <Input {...register("signatory_name")} placeholder="S.DINESH" />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={isSubmitting}>
          <Save size={16} className="mr-2" />
          {isSubmitting ? "Saving..." : "Save Settings"}
        </Button>
      </form>
    </div>
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
      <Label className="text-sm">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
