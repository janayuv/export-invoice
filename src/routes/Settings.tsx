import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Building2,
  Database,
  FolderOpen,
  Hash,
  ImageIcon,
  Landmark,
  LayoutGrid,
  RotateCcw,
  Save,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/PageHeader";
import { PageLoader } from "@/components/PageLoader";
import {
  getStoredDensity,
  setStoredDensity,
  type UiDensity,
} from "@/lib/uiDensity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/useSettings";
import { companySettingsSchema, type CompanySettingsFormValues } from "@/lib/schemas";
import {
  DEFAULT_DB_PATH,
  clearDbPath,
  getStoredDbPath,
  setDbPath,
} from "@/lib/db";

export function Settings() {
  const { settings, loading, saveSettings, saveLogo } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dbPath, setDbPathState] = useState<string | null>(getStoredDbPath());
  const [density, setDensity] = useState<UiDensity>(() => getStoredDensity());

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<CompanySettingsFormValues, any, CompanySettingsFormValues>({
    resolver: zodResolver(companySettingsSchema) as any,
  });

  const fiscalYearOptions = (() => {
    const options: string[] = [];
    for (let start = 2023; start <= 2030; start++) {
      options.push(`${start}-${String(start + 1).slice(-2)}`);
    }
    return options;
  })();

  useEffect(() => {
    if (settings) reset(settings);
  }, [settings, reset]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await saveLogo(reader.result as string);
        toast.success("Logo saved");
      } catch (err) {
        toast.error(`Failed to save logo: ${err}`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleLogoRemove = async () => {
    try {
      await saveLogo("");
      toast.success("Logo removed");
    } catch (err) {
      toast.error(`Failed to remove logo: ${err}`);
    }
  };

  const handleDbBrowse = async () => {
    try {
      const selected = await open({
        title: "Select SQLite Database",
        multiple: false,
        directory: false,
        filters: [
          { name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] },
        ],
      });
      if (typeof selected !== "string") return;
      await setDbPath(selected);
      setDbPathState(selected);
      toast.success("Database selected — restart the app to load it");
    } catch (err) {
      toast.error(`Failed to select database: ${err}`);
    }
  };

  const handleDbReset = async () => {
    try {
      await clearDbPath();
      setDbPathState(null);
      toast.success("Reverted to default database — restart the app to apply");
    } catch (err) {
      toast.error(`Failed to reset database: ${err}`);
    }
  };

  const onSubmit = async (data: CompanySettingsFormValues) => {
    try {
      await saveSettings(data);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(`Failed to save: ${e}`);
    }
  };

  if (loading) {
    return <PageLoader message="Loading settings…" className="p-[18px]" />;
  }

  function handleDensityChange(checked: boolean) {
    const next: UiDensity = checked ? "comfortable" : "dense";
    setDensity(next);
    setStoredDensity(next);
    toast.success(`Density set to ${next}`);
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="p-[18px] space-y-3 animate-fade-up"
    >
      <PageHeader
        title="Settings"
        subtitle="Company information and export configuration"
        actions={
          <Button type="submit" size="sm" disabled={isSubmitting}>
            <Save size={13} className="mr-1.5" />
            {isSubmitting ? "Saving…" : "Save Changes"}
          </Button>
        }
      />

      {/* ── Card: UI Density ── */}
      <SettingsCard
        icon={LayoutGrid}
        title="Display Density"
        description="Adjust spacing and typography across the app."
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200">
              {density === "dense" ? "Dense" : "Comfortable"}
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {density === "dense"
                ? "Compact layout — best for data-heavy screens."
                : "More breathing room between sections."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500">
              Dense
            </span>
            <Switch
              checked={density === "comfortable"}
              onCheckedChange={handleDensityChange}
              aria-label="Toggle comfortable display density"
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500">
              Comfortable
            </span>
          </div>
        </div>
      </SettingsCard>

      {/* ── Card 1: Exporter Information ── */}
      <SettingsCard
        icon={Building2}
        title="Exporter Information"
        description="Printed on every invoice header."
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company Name *" error={errors.name?.message} className="col-span-2">
            <Input
              {...register("name")}
              placeholder="INZI CONTROLS INDIA LIMITED"
              className="text-[12px]"
            />
          </Field>
          <Field label="GSTIN" error={errors.gstin?.message}>
            <Input {...register("gstin")} placeholder="33AAACP5832C1ZW" className="font-mono text-[12px]" />
          </Field>
          <Field label="PAN" error={errors.pan?.message}>
            <Input {...register("pan")} placeholder="AAACP5832C" className="font-mono text-[12px]" />
          </Field>
          <Field label="IEC Code" error={errors.iec?.message} className="col-span-2">
            <Input {...register("iec")} placeholder="IEC0000000000" className="font-mono text-[12px]" />
          </Field>
          <Field label="Address *" error={errors.address?.message} className="col-span-2">
            <Textarea
              {...register("address")}
              placeholder={"SF 72 BANGALORE HIGHWAYS IRRUNGATTUKOTTAI\nVILLAGE, SRIPERUMBUDUR"}
              rows={3}
              className="text-[12px] resize-none"
            />
          </Field>
        </div>
      </SettingsCard>

      {/* ── Card: Invoice Numbering ── */}
      <SettingsCard
        icon={Hash}
        title="Invoice Numbering"
        description="Fiscal year shown in every invoice number (e.g. EXP/1/2025-26)."
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Active Fiscal Year" error={errors.fiscal_year?.message}>
            <Controller
              name="fiscal_year"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger className="text-[12px]">
                    <SelectValue placeholder="Auto (from invoice date)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Auto (from invoice date)</SelectItem>
                    {fiscalYearOptions.map((fy) => (
                      <SelectItem key={fy} value={fy}>
                        {fy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <div className="flex items-end pb-1">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Lock new invoices to a fixed FY, or leave on Auto to derive from the invoice date.
            </p>
          </div>
        </div>
      </SettingsCard>

      {/* ── Card 2: Banking & Export Details ── */}
      <SettingsCard
        icon={Landmark}
        title="Banking & Export Details"
        description="Bank details and export references printed on documents."
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="Bank Name" error={errors.bank_name?.message}>
            <Input {...register("bank_name")} className="text-[12px]" />
          </Field>
          <Field label="Account No" error={errors.bank_account?.message}>
            <Input {...register("bank_account")} className="font-mono text-[12px]" />
          </Field>
          <Field label="IFSC Code" error={errors.ifsc?.message}>
            <Input {...register("ifsc")} className="font-mono text-[12px]" />
          </Field>
          <Field label="SWIFT Code" error={errors.swift?.message}>
            <Input {...register("swift")} className="font-mono text-[12px]" />
          </Field>
          <Field label="Bank AD Code" error={errors.bank_ad_code?.message}>
            <Input {...register("bank_ad_code")} placeholder="6850001" className="font-mono text-[12px]" />
          </Field>
          {/* spacer to keep grid aligned */}
          <div />
          <Field label="LUT ARN No" error={errors.lut_arn_no?.message}>
            <Input {...register("lut_arn_no")} placeholder="AD330426032163J" className="font-mono text-[12px]" />
          </Field>
          <Field label="LUT ARN Date" error={errors.lut_arn_date?.message}>
            <Input {...register("lut_arn_date")} type="date" className="text-[12px]" />
          </Field>
        </div>
      </SettingsCard>

      {/* ── Card 3: Signatory Details ── */}
      <SettingsCard
        icon={UserCheck}
        title="Signatory Details"
        description="Printed in the signature block of every invoice."
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Place (for signature)" error={errors.place?.message}>
            <Input {...register("place")} placeholder="IRRUNGATTUKOTTAI" className="text-[12px]" />
          </Field>
          <Field label="Authorised Signatory Name" error={errors.signatory_name?.message}>
            <Input {...register("signatory_name")} placeholder="S.DINESH" className="text-[12px]" />
          </Field>
        </div>
      </SettingsCard>

      {/* ── Card 4: Company Logo ── */}
      <SettingsCard
        icon={ImageIcon}
        title="Company Logo"
        description="Shown in the invoice header. PNG, JPG, or SVG · max 2 MB · saved immediately on selection."
      >
        <div className="flex items-start gap-4">
          {/* Preview or placeholder box */}
          {settings?.company_logo_base64 ? (
            <img
              src={settings.company_logo_base64}
              alt="Company logo"
              className="h-14 w-20 object-contain rounded border border-zinc-200 dark:border-zinc-700 bg-white shrink-0"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-14 w-20 rounded border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 shrink-0">
              <Building2 size={16} />
              <span className="text-[9px] mt-1">No logo</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} className="mr-1.5" />
                {settings?.company_logo_base64 ? "Replace" : "Upload Logo"}
              </Button>
              {settings?.company_logo_base64 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-zinc-500 dark:text-zinc-400 hover:text-red-500"
                  onClick={handleLogoRemove}
                >
                  <X size={13} className="mr-1" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
              Restart not required after logo change.
            </p>
          </div>
        </div>
      </SettingsCard>

      {/* ── Card 5: Database File ── */}
      <SettingsCard
        icon={Database}
        title="Database File"
        description="Switch to a different SQLite database. Requires app restart."
      >
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-1">
              Active database
            </p>
            <p className="text-[12px] font-mono break-all bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2.5 py-1.5 text-zinc-700 dark:text-zinc-300">
              {dbPath ?? `${DEFAULT_DB_PATH} (default)`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDbBrowse}>
              <FolderOpen size={13} className="mr-1.5" />
              Browse…
            </Button>
            {dbPath && (
              <Button type="button" variant="outline" size="sm" onClick={handleDbReset}>
                <RotateCcw size={13} className="mr-1.5" />
                Use Default
              </Button>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
            Pick a .db / .sqlite file to use instead of the bundled database.
            Restart the app after changing. For backup, restore, and verify, use{" "}
            <span className="text-zinc-500 dark:text-zinc-400">Admin Center → Database Management</span>.
          </p>
        </div>
      </SettingsCard>
    </form>
  );
}

// ── Helper components ──────────────────────────────────────────────────────────

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-start gap-2.5 px-[14px] py-[12px] border-b border-zinc-200 dark:border-zinc-800">
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
      <div className="p-[14px]">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
  error,
  className,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
        {label}
      </Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
