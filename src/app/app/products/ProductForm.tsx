"use client";
import { useServerForm } from "@/lib/useServerForm";
import { createProduct, type ProductFormState } from "./actions";

export function ProductForm({ t, mode }: { t: Record<string, string>; mode: "GROCERY" | "RESTAURANT" }) {
  const { state, onSubmit, pending } = useServerForm<ProductFormState>(createProduct, {});
  return (
    <form onSubmit={onSubmit} className="panel">
      <h2 className="font-extrabold mb-4">{t.addProduct}</h2>
      {state.error && <div className="error-box">{state.error}</div>}
      <div className="grid sm:grid-cols-2 gap-x-3">
        <label className="field"><span>{t.name}</span><input className="input" name="name" required /></label>
        <label className="field"><span>{t.nameAm}</span><input className="input" name="nameAm" /></label>
        <label className="field"><span>{t.category}</span><input className="input" name="category" /></label>
        <label className="field"><span>{t.barcode}</span><input className="input" name="barcode" /></label>
        <label className="field"><span>{t.price}</span><input className="input" name="price" type="number" step="0.01" min="0" required /></label>
        <label className="field"><span>{t.cost}</span><input className="input" name="cost" type="number" step="0.01" min="0" /></label>
        <label className="field"><span>{t.unit}</span>
          <select className="input" name="unit" defaultValue="PIECE">
            {["PIECE", "KG", "GRAM", "LITER", "BOTTLE", "BOX", "PACK"].map((u) => <option key={u}>{u}</option>)}
          </select>
        </label>
        <label className="field"><span>{t.openingStock}</span><input className="input" name="openingStock" type="number" step="0.001" min="0" /></label>
        <label className="field"><span>{t.minStock}</span><input className="input" name="minStock" type="number" step="0.001" min="0" /></label>
      </div>
      <div className="flex flex-wrap gap-4 mb-4 text-sm font-semibold">
        <label className="flex items-center gap-2"><input type="checkbox" name="soldByWeight" /> {t.soldByWeight}</label>
        {mode === "RESTAURANT" && <label className="flex items-center gap-2"><input type="checkbox" name="madeToOrder" /> {t.noStockTracking}</label>}
      </div>
      <button className="btn btn-primary" disabled={pending}>{t.save}</button>
    </form>
  );
}
