import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/db";
import type { CompanySettings } from "@/lib/types";

export function useSettings() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDb();
      const rows = await db.select<CompanySettings[]>(
        "SELECT * FROM company_settings WHERE id = 1"
      );
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
    const db = await getDb();
    await db.execute(
      `UPDATE company_settings SET
        name=$1, address=$2, gstin=$3, pan=$4, iec=$5,
        bank_name=$6, bank_account=$7, ifsc=$8, swift=$9,
        bank_ad_code=$10, lut_arn_no=$11, lut_arn_date=$12,
        place=$13, signatory_name=$14,
        updated_at=datetime('now')
       WHERE id=1`,
      [
        data.name ?? "",
        data.address ?? "",
        data.gstin ?? "",
        data.pan ?? "",
        data.iec ?? "",
        data.bank_name ?? "",
        data.bank_account ?? "",
        data.ifsc ?? "",
        data.swift ?? "",
        data.bank_ad_code ?? "",
        data.lut_arn_no ?? "",
        data.lut_arn_date ?? "",
        data.place ?? "",
        data.signatory_name ?? "",
      ]
    );
    await load();
  }

  return { settings, loading, error, saveSettings, reload: load };
}
