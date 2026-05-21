import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEntries } from "@/hooks/useEntries";
import { useAuth } from "@/contexts/AuthContext";

export function EntryList() {
  const navigate = useNavigate();
  const { entries, loading } = useEntries();
  const { can } = useAuth();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.customer_name.toLowerCase().includes(q) ||
        e.invoice_number.toLowerCase().includes(q) ||
        e.po_number.toLowerCase().includes(q) ||
        e.local_invoice_no.toLowerCase().includes(q) ||
        e.shipping_bill_no.toLowerCase().includes(q)
    );
  }, [entries, filter]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Entries</h2>
          <p className="text-muted-foreground text-sm mt-1">{entries.length} total entries</p>
        </div>
        {can("create_invoice") && (
          <Button size="sm" onClick={() => navigate("/entries/new")}>
            <PlusCircle size={16} className="mr-1" />
            New Entry
          </Button>
        )}
      </div>

      <div className="relative flex-1 max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search customer, invoice, PO, shipping bill…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-8"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Invoice No</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>PO No</TableHead>
                <TableHead>Local Invoice No</TableHead>
                <TableHead>Shipping Bill No</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No entries found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/entries/${entry.id}/edit`)}
                  >
                    <TableCell>{entry.customer_name || "—"}</TableCell>
                    <TableCell>{entry.invoice_number || "—"}</TableCell>
                    <TableCell>{entry.invoice_date || "—"}</TableCell>
                    <TableCell>{entry.po_number || "—"}</TableCell>
                    <TableCell>{entry.local_invoice_no || "—"}</TableCell>
                    <TableCell>{entry.shipping_bill_no || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={entry.status === "final" ? "default" : "secondary"}>
                        {entry.status === "final" ? "Final" : "Draft"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
