import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { PAYMENT_LABELS, translator } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { localized } from "@/lib/errors";
import { parseRange, ReportError, salesReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || (s.role !== "OWNER" && s.role !== "MANAGER")) return new NextResponse("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  try {
    const range = parseRange(q.get("from") ?? undefined, q.get("to") ?? undefined);
    const r = await salesReport(s, range);
    const lang = await getLang();
    const t = translator(lang);
    const etb = t("etb");
    const birr = (n: number) => n / 100;
    const wb = new ExcelJS.Workbook();
    const money = "#,##0.00";

    const sum = wb.addWorksheet(t("reports"));
    sum.addRows([
      [t("reports"), `${range.from} → ${range.to}`],
      [],
      [t("orders"), r.orders],
      [`${t("grossSales")} (${etb})`, birr(r.gross)],
      [`${t("discounts")} (${etb})`, birr(r.discount)],
      [`${t("refundsTotal")} (${etb})`, birr(r.refunded)],
      [`${t("netSalesLabel")} (${etb})`, birr(r.net)],
      [`${t("vatIncluded")} (${etb})`, birr(r.vat)],
      [`${t("purchasesReceived")} (${etb})`, birr(r.purchases.total)],
    ]);
    sum.getColumn(1).width = 28; sum.getColumn(2).width = 22; sum.getColumn(2).numFmt = money;
    sum.getRow(1).font = { bold: true };

    const day = wb.addWorksheet(t("byDay"));
    day.addRow([t("date"), t("orders"), `${t("grossSales")} (${etb})`, `${t("refundsTotal")} (${etb})`, `${t("netSalesLabel")} (${etb})`]).font = { bold: true };
    for (const d of r.byDay) day.addRow([d.day, d.orders, birr(d.gross), birr(d.refunds), birr(d.net)]);
    for (const c of [3, 4, 5]) day.getColumn(c).numFmt = money;
    day.columns.forEach((c) => (c.width = 16));

    const pay = wb.addWorksheet(t("byPayment"));
    pay.addRow([t("payment"), `${t("amount")} (${etb})`]).font = { bold: true };
    for (const m of r.byMethod) pay.addRow([PAYMENT_LABELS[m.method]?.[lang] ?? m.method, birr(m.amount)]);
    pay.getColumn(2).numFmt = money; pay.getColumn(1).width = 22; pay.getColumn(2).width = 18;

    const top = wb.addWorksheet(t("topProducts"));
    top.addRow([t("product"), t("quantity"), `${t("revenue")} (${etb})`]).font = { bold: true };
    for (const p of r.topProducts) top.addRow([p.name, p.quantity, birr(p.revenue)]);
    top.getColumn(3).numFmt = money; top.getColumn(1).width = 30; top.getColumn(2).width = 12; top.getColumn(3).width = 16;

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="sales-${range.from}_${range.to}.xlsx"`,
      },
    });
  } catch (e) {
    if (e instanceof ReportError) return new NextResponse(await localized(e.message), { status: 400 });
    console.error(e);
    return new NextResponse("Something went wrong", { status: 500 });
  }
}
