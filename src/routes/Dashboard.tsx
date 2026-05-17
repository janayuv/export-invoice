import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, PlusCircle, Clock, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";

interface Stats {
  total: number;
  thisMonth: number;
  drafts: number;
  finals: number;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total: 0, thisMonth: 0, drafts: 0, finals: 0 });

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const [total] = await db.select<{ c: number }[]>("SELECT COUNT(*) as c FROM invoices");
        const [thisMonth] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')"
        );
        const [drafts] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices WHERE status='draft'"
        );
        const [finals] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices WHERE status='final'"
        );
        setStats({
          total: total.c,
          thisMonth: thisMonth.c,
          drafts: drafts.c,
          finals: finals.c,
        });
      } catch {
        // DB may not be ready yet on first load
      }
    })();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-1">Overview of your export invoices</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Total Invoices" value={stats.total} icon={FileText} />
        <StatCard title="This Month" value={stats.thisMonth} icon={Clock} />
        <StatCard title="Drafts" value={stats.drafts} icon={Clock} className="text-amber-600" />
        <StatCard title="Finalized" value={stats.finals} icon={CheckCircle} className="text-green-600" />
      </div>

      <div className="flex gap-3">
        <Button onClick={() => navigate("/invoices/new")}>
          <PlusCircle size={16} className="mr-2" />
          New Invoice
        </Button>
        <Button variant="outline" onClick={() => navigate("/invoices")}>
          <FileText size={16} className="mr-2" />
          View All Invoices
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  className,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon size={16} className={className ?? "text-muted-foreground"} />
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${className ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
