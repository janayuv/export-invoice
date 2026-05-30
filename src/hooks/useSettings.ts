import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/lib/db";
import { withRetry } from "@/lib/retry";
import type { CompanySettings } from "@/lib/types";

export function useSettings() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await withRetry(async () => {
        const db = await getDb();
        return db.select<CompanySettings[]>(
          "SELECT * FROM company_settings WHERE id = 1"
        );
      });
      setSettings(rows[0] ?? null);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings(data: Partial<CompanySettings>) {
    await invoke("save_company_settings", {
      payload: {
        name: data.name ?? "",
        address: data.address ?? "",
        gstin: data.gstin ?? "",
        pan: data.pan ?? "",
        iec: data.iec ?? "",
        bank_name: data.bank_name ?? "",
        bank_account: data.bank_account ?? "",
        ifsc: data.ifsc ?? "",
        swift: data.swift ?? "",
        bank_ad_code: data.bank_ad_code ?? "",
        lut_arn_no: data.lut_arn_no ?? "",
        lut_arn_date: data.lut_arn_date ?? "",
        place: data.place ?? "",
        signatory_name: data.signatory_name ?? "",
      },
    });
    await load();
  }

  async function saveLogo(base64: string) {
    await invoke("save_company_logo", { base64 });
    await load();
  }

  const companyLogo = settings?.company_logo_base64 ?? "";

  return { settings, loading, error, saveSettings, saveLogo, reload: load, companyLogo };
}
