import { useState } from "react";
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
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  draft: "secondary",
  confirmed: "default",
  closed: "outline",
};

export function PurchaseOrderList() {
  const navigate = useNavigate();
  const { orders, loading } = usePurchaseOrders();
  const [search, setSearch] = useState("");

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.po_number.toLowerCase().includes(q) ||
      (o.customer_po_no ?? "").toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading purchase orders…</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Purchase Orders</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orders.length} order{orders.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button size="sm" onClick={() => navigate("/purchase-orders/new")}>
          <PlusCircle size={16} className="mr-1" /> New PO
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search customer PO, internal ref, or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer PO No</TableHead>
              <TableHead>Internal Ref</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow
                key={o.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/purchase-orders/${o.id}`)}
              >
                <TableCell className="font-medium">{o.customer_po_no || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{o.po_number}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{o.po_date}</TableCell>
                <TableCell>{o.customer_name || "—"}</TableCell>
                <TableCell className="text-sm">{o.currency}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[o.status] ?? "secondary"}>
                    {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  {search ? "No orders match your search" : "No purchase orders yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
