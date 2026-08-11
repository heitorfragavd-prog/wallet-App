import React, { useRef, useEffect, forwardRef } from "react";
import { Search, ScanLine } from "lucide-react";
import { Input } from "@/shared/components/ui/input";

interface Props { value: string; onChange: (v: string) => void; onSearch: () => void; }

export const PDVSearchInput = forwardRef<HTMLInputElement, Props>(({ value, onChange, onSearch }, ref) => {
  useEffect(() => { (ref as any)?.current?.focus(); }, [ref]);
  return (
    <div className="relative w-full">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
      <Input ref={ref} type="text" placeholder="[F2] Bipe o código de barras ou digite o nome..."
        className="w-full pl-12 pr-12 py-4 text-base bg-[#1C2541]/50 border-[#1E2942] rounded-2xl text-white placeholder:text-slate-500 focus:border-emerald-500/50"
        value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSearch(); } }}
        autoComplete="off" spellCheck={false} />
      <ScanLine className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
    </div>
  );
});
PDVSearchInput.displayName = "PDVSearchInput";
