import { useState, useCallback, type FormEvent, type ReactNode } from "react";
import { jsPDF } from "jspdf";
import akzLogo from "../assets/AKZ_logo.png";
import { toast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// ── Constants ─────────────────────────────────────────────────────────────────
const PANEL_BRANDS   = ["Longi", "Jinko", "Canadian Solar", "Aiko", "Risen", "Philadelphia", "Ecoshield"];
const INVERTER_SIZES = [5, 8, 10, 12, 15, 20, 30, 50];
const NAVY = "#001f3f";
const V1   = 230;
const V3   = 400;
const SQ3  = 1.732;
const PF   = 0.85;
const BKWH = 5.12;
const DOD  = 0.8;
const SRG  = 1.5;

type Tab = "residential" | "commercial" | "agricultural";

const TABS: { id: Tab; ar: string; en: string; spec: string }[] = [
  { id: "residential",  ar: "سكني",  en: "Residential",  spec: "1-Phase · 230V · Battery Backup"      },
  { id: "commercial",   ar: "تجاري", en: "Commercial",   spec: "High Load · 3-Phase · Battery Backup" },
  { id: "agricultural", ar: "زراعي", en: "Agricultural", spec: "3-Phase · 400V Pump · No Batteries"   },
];

// ── Form ──────────────────────────────────────────────────────────────────────
interface Form {
  panelBrand: string; panelWattage: number;
  dayAmps: number; nightAmps: number; backupHours: number;
  effP: number; effI: number; effB: number;
  costPanels: number; costBatteries: number; costInverter: number; costInstall: number;
  savings: number;
}

const initForm = (): Form => ({
  panelBrand: "Longi", panelWattage: 620,
  dayAmps: 20, nightAmps: 10, backupHours: 3,
  effP: 80, effI: 80, effB: 80,
  costPanels: 0, costBatteries: 0, costInverter: 0, costInstall: 0,
  savings: 0,
});

// ── Calculations ──────────────────────────────────────────────────────────────
interface Calc {
  cap: number; panels: number; strings: number; pps: number;
  batt: number; inv: number; ctrl: string;
  total: number; annual: number; payback: number; roi: number;
}

interface AdvancedConfig {
  maxDcVoltage: number;
  mpptMin: number;
  mpptMax: number;
  maxInputCurrentPerMppt: number;
  panelVoc: number;
  panelVmp: number;
  tempCoeffVoc: number;
  minAmbientTemp: number;
  maxPanelTemp: number;
}

const initAdvanced = (): AdvancedConfig => ({
  maxDcVoltage: 1100,
  mpptMin: 180,
  mpptMax: 850,
  maxInputCurrentPerMppt: 26,
  panelVoc: 49.5,
  panelVmp: 41.6,
  tempCoeffVoc: -0.28,
  minAmbientTemp: 0,
  maxPanelTemp: 70,
});

let logoDataUrlPromise: Promise<string> | null = null;

function getLogoDataUrl() {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(akzLogo)
      .then((res) => res.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Failed to read logo file"));
            reader.readAsDataURL(blob);
          }),
      );
  }
  return logoDataUrlPromise;
}

function optStrings(n: number) {
  if (n <= 0) return { strings: 0, pps: 0 };
  for (let s = 1; s <= n; s++) {
    const p = Math.ceil(n / s);
    if (p >= 10 && p <= 14) return { strings: s, pps: p };
  }
  let best = { strings: 1, pps: n }, bestD = Math.abs(n - 12);
  for (let s = 2; s <= n; s++) {
    const p = Math.ceil(n / s), d = Math.abs(p - 12);
    if (d < bestD) { bestD = d; best = { strings: s, pps: p }; }
  }
  return best;
}

function getCtrl(panels: number, inv: number, tab: Tab) {
  if (tab === "agricultural") return "Dual MPPT VFD Inverter (3-Phase Pump Drive)";
  if (tab === "commercial")   return inv >= 20 ? "Multiple MPPT Controllers" : "Dual MPPT Inverter";
  return panels > 12 ? "Dual MPPT Inverter" : "Single MPPT Inverter";
}

function runAdvanced(a: AdvancedConfig, pps: number) {
  const deltaCold = Math.max(0, 25 - a.minAmbientTemp);
  const deltaHot = Math.max(0, a.maxPanelTemp - 25);
  const tc = Math.abs(a.tempCoeffVoc) / 100;

  const vocAtCold = a.panelVoc * (1 + tc * deltaCold);
  const vmpAtHot = a.panelVmp * (1 - tc * deltaHot);
  const safeMaxByVoc = vocAtCold > 0 ? Math.floor(a.maxDcVoltage / vocAtCold) : 0;
  const safeMinByMppt = vmpAtHot > 0 ? Math.ceil(a.mpptMin / vmpAtHot) : 0;
  const safeMaxByMppt = vmpAtHot > 0 ? Math.floor(a.mpptMax / vmpAtHot) : 0;
  const safeMin = Math.max(1, safeMinByMppt);
  const safeMax = Math.max(0, Math.min(safeMaxByVoc, safeMaxByMppt));

  const stringVocCold = pps * vocAtCold;
  const stringVmpHot = pps * vmpAtHot;
  const redWarning = stringVocCold > a.maxDcVoltage;
  const yellowWarning = stringVmpHot < a.mpptMin;

  return {
    vocAtCold,
    vmpAtHot,
    safeMin,
    safeMax,
    stringVocCold,
    stringVmpHot,
    redWarning,
    yellowWarning,
  };
}

function drawArabicLineAsImage(doc: jsPDF, text: string, centerX: number, baselineY: number, fontSize = 10) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const padding = 14;
  ctx.font = `${fontSize}px "Segoe UI", Tahoma, Arial`;
  const textWidth = Math.ceil(ctx.measureText(text).width);
  const width = Math.max(220, textWidth + padding * 2);
  const height = Math.ceil(fontSize * 1.9);
  canvas.width = width;
  canvas.height = height;

  const ctx2 = canvas.getContext("2d");
  if (!ctx2) return;
  ctx2.fillStyle = "rgba(0,0,0,0)";
  ctx2.fillRect(0, 0, width, height);
  ctx2.fillStyle = "#ffffff";
  ctx2.font = `${fontSize}px "Segoe UI", Tahoma, Arial`;
  ctx2.textAlign = "center";
  ctx2.textBaseline = "middle";
  ctx2.direction = "rtl";
  ctx2.fillText(text, width / 2, height / 2 + 0.5);

  const dataUrl = canvas.toDataURL("image/png");
  const pdfW = width * 0.17;
  const pdfH = height * 0.17;
  doc.addImage(dataUrl, "PNG", centerX - pdfW / 2, baselineY - pdfH + 1.8, pdfW, pdfH);
}

function run(f: Form, tab: Tab): Calc {
  const ep = f.effP / 100, ei = f.effI / 100, eb = f.effB / 100;
  const cap    = tab === "agricultural"
    ? (f.dayAmps * V3 * SQ3 * PF) / 1000
    : (f.dayAmps * V1 * PF) / 1000;
  const denom  = f.panelWattage * ep * ei;
  const panels = denom > 0 ? Math.ceil((cap * 1000) / denom) : 0;
  const { strings, pps } = optStrings(panels);
  const batt   = tab === "agricultural" || f.nightAmps <= 0 ? 0
    : Math.ceil((f.nightAmps * V1 * f.backupHours) / (BKWH * DOD * eb * 1000));
  const minInv = cap * SRG;
  const inv    = INVERTER_SIZES.find((s) => s >= minInv) ?? INVERTER_SIZES[INVERTER_SIZES.length - 1];
  const ctrl   = getCtrl(panels, inv, tab);
  const battC  = tab === "agricultural" ? 0 : f.costBatteries;
  const total  = f.costPanels + battC + f.costInverter + f.costInstall;
  const annual = f.savings * 12;
  const payback = annual > 0 ? total / annual : 0;
  const roi     = total > 0 && annual > 0 ? (annual / total) * 100 : 0;
  return { cap, panels, strings, pps, batt, inv, ctrl, total, annual, payback, roi };
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function exportPDF(
  f: Form,
  r: Calc,
  tab: Tab,
  advancedConfig?: AdvancedConfig,
  advancedResult?: ReturnType<typeof runAdvanced>,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const generatedAt = new Date().toLocaleString("en-GB");
  const ML = 18, CW = W - ML * 2;
  const isA = tab === "agricultural";
  const tabLabel = tab === "residential" ? "Residential - 1-Phase 230V"
    : tab === "commercial" ? "Commercial - High Load 3-Phase"
    : "Agricultural - 3-Phase 400V Pump";

  // Header
  doc.setFillColor(0, 31, 63);
  doc.rect(0, 0, W, 48, "F");
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 45, W, 3, "F");
  try {
    const logoDataUrl = await getLogoDataUrl();
    doc.addImage(logoDataUrl, "PNG", ML, 7, 22, 22);
  } catch {
    // Keep PDF generation working even if logo loading fails.
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("IRAQ SUN POWER", W / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Solar Energy Solutions - Technical Proposal", W / 2, 23, { align: "center" });
  drawArabicLineAsImage(doc, "طاقة شمس العراق", W / 2, 28.2, 11);
  doc.setFontSize(9);
  doc.text("System Type: " + tabLabel, W / 2, 32, { align: "center" });
  doc.text("Date: " + new Date().toLocaleDateString("en-GB"), W / 2, 39, { align: "center" });

  let y = 60;

  const sec = (title: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 31, 63);
    doc.text(title, ML, y); y += 2;
    doc.setDrawColor(0, 31, 63); doc.setLineWidth(0.4);
    doc.line(ML, y, ML + CW, y); y += 7;
  };

  const row = (label: string, value: string, shade: boolean) => {
    if (shade) { doc.setFillColor(236, 243, 255); doc.rect(ML, y - 4.5, CW, 7, "F"); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0, 31, 63);
    doc.text(label + ":", ML + 2, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 40);
    doc.text(value, ML + 84, y); y += 8;
  };

  const totalRow = (label: string, value: string) => {
    doc.setFillColor(0, 31, 63); doc.rect(ML, y - 4.5, CW, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
    doc.text(label + ":", ML + 2, y); doc.text(value, ML + 84, y); y += 12;
  };

  const ensureAppendixPage = (requiredSpace = 88) => {
    if (y + requiredSpace <= H - 20) return;
    doc.addPage("a4", "portrait");
    y = 24;
    doc.setFillColor(0, 31, 63);
    doc.rect(0, 0, W, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("AKZ Sun Energy - Iraq | Installer Appendix", W / 2, 10.5, { align: "center" });
    doc.setTextColor(40, 40, 40);
  };

  sec("1. System Configuration");
  row("Panel Brand",         f.panelBrand, false);
  row("Panel Wattage",       f.panelWattage + " W", true);
  row("Panel Efficiency",    f.effP + "%", false);
  row("Inverter Efficiency", f.effI + "%", true);
  if (!isA) row("Battery Efficiency", f.effB + "%", false);
  row("Day Load",            f.dayAmps + " A", !isA);
  if (!isA) {
    row("Night Load",   f.nightAmps + " A", false);
    row("Backup Hours", f.backupHours + " h", true);
  }
  y += 4;

  sec("2. Technical Results");
  row("System Capacity",      r.cap.toFixed(2) + " kW", false);
  row("Total Panels",         r.panels + " panels", true);
  row("String Configuration", r.strings + " strings x " + r.pps + " panels / string", false);
  if (!isA) row("Battery Bank", r.batt + " x 5.12 kWh (LiFePO4)", true);
  row("Inverter Size (1.5x)", r.inv + " kW", isA);
  row("Controller Rec.",      r.ctrl, !isA);
  y += 4;

  sec("3. Cost Breakdown");
  row("Panels Cost",   "$ " + f.costPanels.toLocaleString("en-US"), false);
  if (!isA) row("Batteries Cost", "$ " + f.costBatteries.toLocaleString("en-US"), true);
  row("Inverter Cost", "$ " + f.costInverter.toLocaleString("en-US"), isA);
  row("Installation",  "$ " + f.costInstall.toLocaleString("en-US"), !isA);
  totalRow("TOTAL SYSTEM COST", "$ " + r.total.toLocaleString("en-US"));

  sec("4. Financial Analysis");
  row("Monthly Savings", "$ " + f.savings.toLocaleString("en-US"), false);
  row("Annual Savings",  "$ " + r.annual.toLocaleString("en-US"), true);
  row("Payback Period",  r.payback > 0 ? r.payback.toFixed(1) + " years" : "N/A", false);
  row("Annual ROI",      r.roi > 0 ? r.roi.toFixed(1) + "%" : "N/A", true);
  y += 4;

  sec("5. Engineering Formulas");
  doc.setFont("courier", "normal"); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
  if (isA) {
    doc.text("Capacity  = (Amps x 400V x 1.732 x 0.85 PF) / 1000", ML + 2, y); y += 5;
  } else {
    doc.text("Capacity  = (Day Amps x 230V x 0.85 PF) / 1000", ML + 2, y); y += 5;
    doc.text("Batteries = (Night Amps x 230V x Hours) / (5.12kWh x 0.8 DoD x effB)", ML + 2, y); y += 5;
  }
  doc.text("Panels    = (Capacity x 1000) / (Wattage x effP x effI)", ML + 2, y); y += 5;
  doc.text("Inverter  = Next standard size >= Capacity x 1.5 (Iraq surge + heat)", ML + 2, y);

  if (advancedConfig && advancedResult) {
    ensureAppendixPage(100);
    y += 8;
    sec("6. Installer Appendix (Advanced String Configuration)");
    row("Max DC Input Voltage", advancedConfig.maxDcVoltage + " V", false);
    row("MPPT Voltage Range", advancedConfig.mpptMin + " - " + advancedConfig.mpptMax + " V", true);
    row("Max Input Current / MPPT", advancedConfig.maxInputCurrentPerMppt + " A", false);
    row("Panel Voc / Vmp", advancedConfig.panelVoc.toFixed(2) + " V / " + advancedConfig.panelVmp.toFixed(2) + " V", true);
    row("Temp Coeff. Voc", advancedConfig.tempCoeffVoc.toFixed(2) + " %/C", false);
    row("Ambient Check Temps", advancedConfig.minAmbientTemp + "C / " + advancedConfig.maxPanelTemp + "C", true);
    const safeRangeText = advancedResult.safeMax >= advancedResult.safeMin
      ? `${advancedResult.safeMin} - ${advancedResult.safeMax} panels/string`
      : "Out of Range";
    row("Safe Panels per String", safeRangeText, false);
    row("Design Voc @ Cold", advancedResult.stringVocCold.toFixed(1) + " V", true);
    row("Design Vmp @ Hot", advancedResult.stringVmpHot.toFixed(1) + " V", false);
    if (advancedResult.redWarning) {
      doc.setTextColor(180, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("Warning: Voc exceeds inverter Max DC at low temperature.", ML + 2, y);
      y += 7;
      doc.setTextColor(40, 40, 40);
      doc.setFont("helvetica", "normal");
    } else if (advancedResult.yellowWarning) {
      doc.setTextColor(180, 120, 0);
      doc.setFont("helvetica", "bold");
      doc.text("Warning: Vmp drops below inverter MPPT minimum at high temperature.", ML + 2, y);
      y += 7;
      doc.setTextColor(40, 40, 40);
      doc.setFont("helvetica", "normal");
    }
  }

  const addPageFooter = (pageIndex: number, pagesCount: number) => {
    doc.setFillColor(0, 31, 63); doc.rect(0, H - 24, W, 24, "F");
    doc.setFillColor(245, 158, 11); doc.rect(0, H - 24, W, 2.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "italic"); doc.setFontSize(8);
    doc.text("Approved by Eng. Riyadh Nouri", W / 2, H - 16.5, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text("Baghdad-Sinaa Street Near Univ. of Technology", W / 2, H - 12.2, { align: "center" });
    drawArabicLineAsImage(doc, "بغداد شارع الصناعة قرب الجامعة التكنلوجية", W / 2, H - 8.1, 9);
    doc.text(`Generated: ${generatedAt} | Page ${pageIndex} of ${pagesCount}`, W / 2, H - 3.6, { align: "center" });
  };

  const pages = doc.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= pages; pageIndex++) {
    doc.setPage(pageIndex);
    addPageFooter(pageIndex, pages);
  }

  doc.save("IraqSunPower_Proposal_" + tab + ".pdf");
}

const HERO_BACKGROUNDS: Record<Tab, string> = {
  residential: "/src/assets/Residential.png",
  commercial: "/src/assets/Industrial.png",
  agricultural: "/src/assets/Agricultural.png",
};

function HeroSection({ tab, activeTab }: { tab: Tab; activeTab: (typeof TABS)[number] }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl shadow-sm border border-slate-300 bg-slate-900 min-h-[280px] sm:min-h-[320px] md:min-h-[360px] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${HERO_BACKGROUNDS[tab]})` }}
    >
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative z-10 p-5 sm:p-8 md:p-10 flex flex-col justify-end h-full">
        <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/85 mb-2">
          AKZ Iraq Sun Energy
        </p>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white leading-tight">
          {activeTab.en} Solar Calculator
        </h1>
        <p className="mt-2 text-sm sm:text-base text-white/85 max-w-2xl">
          {activeTab.spec}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href="#system-inputs"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm sm:text-base px-5 py-2.5 transition-colors shadow-lg"
          >
            Start System Design
            <span aria-hidden>→</span>
          </a>
          <a
            href="#financial-pdf"
            className="inline-flex items-center gap-2 rounded-lg border border-white/35 bg-white/10 hover:bg-white/20 text-white font-bold text-sm sm:text-base px-5 py-2.5 transition-colors"
          >
            Go to PDF Report
            <span aria-hidden>↓</span>
          </a>
        </div>
      </div>
    </div>
  );
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="mb-1.5">
      <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: NAVY }}>{text}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function NumInput({ value, onChange, min = 0, step = 1, unit }: {
  value: number; onChange: (v: number) => void;
  min?: number; step?: number; unit?: string;
}) {
  return (
    <div className="relative">
      <input type="number" value={value} min={min} step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 transition"
        style={{ paddingRight: unit ? "2.8rem" : "0.75rem" }}
        onFocus={(e) => e.target.style.borderColor = NAVY}
        onBlur={(e) => e.target.style.borderColor = "#e2e8f0"} />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">{unit}</span>
      )}
    </div>
  );
}

function SelInput({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white focus:outline-none transition"
      onFocus={(e) => e.target.style.borderColor = NAVY}
      onBlur={(e) => e.target.style.borderColor = "#e2e8f0"}>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: NAVY }}>{label}</p>
        <span className="text-xs font-extrabold text-white px-2.5 py-0.5 rounded-full"
          style={{ background: NAVY }}>{value}%</span>
      </div>
      <input type="range" min={50} max={100} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full cursor-pointer" style={{ accentColor: NAVY }} />
      <div className="flex justify-between text-[10px] text-slate-300 mt-1"><span>50%</span><span>100%</span></div>
    </div>
  );
}

function Card({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100" style={{ background: "#f8fafc" }}>
        <p className="text-sm font-extrabold" style={{ color: NAVY }}>{title}</p>
        {badge && <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{badge}</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatBox({ label, value, sub, primary }: { label: string; value: string; sub?: string; primary?: boolean }) {
  if (primary) {
    return (
      <div className="rounded-xl px-4 py-3 col-span-2" style={{ background: NAVY }}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">{label}</p>
        <p className="text-2xl font-extrabold text-white">{value}</p>
        {sub && <p className="text-xs text-white/40 mt-0.5">{sub}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3 bg-white">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
      <p className="text-lg font-extrabold" style={{ color: NAVY }}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
}

function CostBar({ label, amount, pct }: { label: string; amount: number; pct: number }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-bold text-slate-500">{label}</span>
        <span className="text-xs font-extrabold" style={{ color: NAVY }}>${amount.toLocaleString("en-US")}</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: Math.min(100, pct) + "%", background: NAVY }} />
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function SolarDesigner() {
  const [tab, setTab] = useState<Tab>("residential");
  const [forms, setForms] = useState<Record<Tab, Form>>({
    residential:  initForm(),
    commercial:   initForm(),
    agricultural: initForm(),
  });
  const [showProMode, setShowProMode] = useState(false);
  const [advanced, setAdvanced] = useState<Record<Tab, AdvancedConfig>>({
    residential: initAdvanced(),
    commercial: initAdvanced(),
    agricultural: initAdvanced(),
  });
  const [feedback, setFeedback] = useState({
    name: "",
    profession: "",
    comments: "",
  });

  const f   = forms[tab];
  const isA = tab === "agricultural";
  const set = useCallback((k: keyof Form, v: number | string) =>
    setForms((p) => ({ ...p, [tab]: { ...p[tab], [k]: v } })), [tab]);

  const r   = run(f, tab);
  const pct = (v: number) => r.total > 0 ? (v / r.total) * 100 : 0;
  const setAdvancedField = useCallback((k: keyof AdvancedConfig, v: number) =>
    setAdvanced((p) => ({ ...p, [tab]: { ...p[tab], [k]: v } })), [tab]);
  const adv = advanced[tab];
  const advResult = runAdvanced(adv, r.pps);

  const activeTab = TABS.find((t) => t.id === tab)!;
  const submitFeedback = (e: FormEvent) => {
    e.preventDefault();
    toast({
      title: "شكراً لمساهمتك في تطوير مشروع شمس العراق",
      description: "تم استلام ملاحظاتك الفنية بنجاح.",
    });
    setFeedback({ name: "", profession: "", comments: "" });
  };

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f8", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="fixed top-4 right-4 z-50 rounded-full border border-amber-300 bg-amber-100/95 px-3 py-1.5 shadow-sm">
        <p className="text-[10px] sm:text-xs font-extrabold text-amber-900 tracking-wide">Beta Version v1.1 - For Professional Testing</p>
      </div>

      {/* ── Header ── */}
      <header style={{ background: NAVY }}>
        <div className="max-w-4xl mx-auto px-5 pt-7 pb-0">
          {/* Brand */}
          <div className="flex items-center gap-4 mb-7">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <img src={akzLogo} alt="AKZ Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-white font-extrabold text-xl tracking-wide">Iraq Sun Power</span>
                <span className="text-white/20 hidden sm:inline text-xl font-thin">|</span>
                <span className="font-bold text-xl" style={{ color: "#f59e0b" }}>طاقة شمس العراق</span>
              </div>
              <p className="text-white/35 text-xs mt-0.5 tracking-wide">Solar PV System Designer — Iraq Grid Standard</p>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl transition-all focus:outline-none"
                style={tab === t.id
                  ? { background: "#f0f4f8", color: NAVY }
                  : { color: "rgba(255,255,255,0.45)" }}>
                <span className="hidden sm:inline">{t.en}</span>
                <span className="sm:hidden">{t.ar}</span>
                <span className="hidden md:inline text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={tab === t.id
                    ? { background: "rgba(0,31,63,0.1)", color: NAVY }
                    : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
                  {t.ar}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Sub-strip */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-5 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-extrabold uppercase tracking-widest" style={{ color: NAVY }}>{activeTab.en}</span>
          <span className="text-slate-200">·</span>
          <span className="text-xs text-slate-400">{activeTab.spec}</span>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-5 py-7 space-y-5">

        <HeroSection tab={tab} activeTab={activeTab} />

        {tab !== "residential" && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowProMode((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold tracking-wider uppercase transition-colors"
              style={showProMode ? { background: NAVY, color: "#fff" } : { background: "#e2e8f0", color: "#334155" }}
            >
              PRO
              <span>{showProMode ? "On" : "Off"}</span>
            </button>
          </div>
        )}

        {tab !== "residential" && showProMode && (
          <Card title="Advanced Installer Mode" badge="String Configuration Tool">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <FieldLabel text="Max DC Input Voltage" hint="Inverter absolute DC limit" />
                <NumInput value={adv.maxDcVoltage} onChange={(v) => setAdvancedField("maxDcVoltage", v)} min={100} step={10} unit="V" />
              </div>
              <div>
                <FieldLabel text="Max Input Current / MPPT" hint="Per MPPT tracker current limit" />
                <NumInput value={adv.maxInputCurrentPerMppt} onChange={(v) => setAdvancedField("maxInputCurrentPerMppt", v)} min={1} step={1} unit="A" />
              </div>
              <div>
                <FieldLabel text="MPPT Voltage Min" hint="Minimum MPPT operating voltage" />
                <NumInput value={adv.mpptMin} onChange={(v) => setAdvancedField("mpptMin", v)} min={50} step={5} unit="V" />
              </div>
              <div>
                <FieldLabel text="MPPT Voltage Max" hint="Maximum MPPT operating voltage" />
                <NumInput value={adv.mpptMax} onChange={(v) => setAdvancedField("mpptMax", v)} min={100} step={5} unit="V" />
              </div>
              <div>
                <FieldLabel text="Panel Voc (STC)" hint="Open-circuit voltage at 25C" />
                <NumInput value={adv.panelVoc} onChange={(v) => setAdvancedField("panelVoc", v)} min={1} step={0.1} unit="V" />
              </div>
              <div>
                <FieldLabel text="Panel Vmp (STC)" hint="Max power voltage at 25C" />
                <NumInput value={adv.panelVmp} onChange={(v) => setAdvancedField("panelVmp", v)} min={1} step={0.1} unit="V" />
              </div>
              <div>
                <FieldLabel text="Temp Coeff. Voc" hint="Percent per degree C (typically negative)" />
                <NumInput value={adv.tempCoeffVoc} onChange={(v) => setAdvancedField("tempCoeffVoc", v)} min={-1} step={0.01} unit="%/C" />
              </div>
              <div>
                <FieldLabel text="Min Ambient Temp (Iraq)" hint="Default cold safety check temperature" />
                <NumInput value={adv.minAmbientTemp} onChange={(v) => setAdvancedField("minAmbientTemp", v)} min={-10} step={1} unit="C" />
              </div>
              <div>
                <FieldLabel text="Max Panel Temp (Iraq)" hint="Default hot MPPT efficiency temperature" />
                <NumInput value={adv.maxPanelTemp} onChange={(v) => setAdvancedField("maxPanelTemp", v)} min={30} step={1} unit="C" />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatBox label="Voc @ Min Temp" value={advResult.vocAtCold.toFixed(2) + " V"} sub="Cold condition voltage rise" />
              <StatBox label="Vmp @ Max Temp" value={advResult.vmpAtHot.toFixed(2) + " V"} sub="Hot condition voltage drop" />
              <StatBox
                label="Safe Panels / String"
                value={advResult.safeMax >= advResult.safeMin ? `${advResult.safeMin} - ${advResult.safeMax}` : "Out of Range"}
                sub="Calculated from Voc safety + MPPT range"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold text-slate-500 mb-1">Current design check ({r.pps} panels/string)</p>
              <p className="text-sm text-slate-700">String Voc @ {adv.minAmbientTemp}C: <span className="font-bold">{advResult.stringVocCold.toFixed(1)} V</span></p>
              <p className="text-sm text-slate-700">String Vmp @ {adv.maxPanelTemp}C: <span className="font-bold">{advResult.stringVmpHot.toFixed(1)} V</span></p>
            </div>

            {advResult.redWarning && (
              <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
                <p className="text-sm font-bold text-red-700">Safety Risk: Total Voc at {adv.minAmbientTemp}C exceeds inverter Max DC Voltage.</p>
              </div>
            )}

            {!advResult.redWarning && advResult.yellowWarning && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm font-bold text-amber-700">Efficiency Warning: Vmp at high temperature drops below inverter Min MPPT voltage.</p>
              </div>
            )}
          </Card>
        )}

        {/* ── 1. System Inputs ── */}
        <div id="system-inputs" className="scroll-mt-24">
        <Card title="System Inputs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <FieldLabel text="Panel Brand" />
              <SelInput value={f.panelBrand} onChange={(v) => set("panelBrand", v)} opts={PANEL_BRANDS} />
            </div>
            <div>
              <FieldLabel text="Panel Wattage" hint="Default: 620W" />
              <NumInput value={f.panelWattage} onChange={(v) => set("panelWattage", v)} min={100} step={10} unit="W" />
            </div>
            <div>
              <FieldLabel
                text={isA ? "3-Phase Load (Amps)" : "Day Load (Amps)"}
                hint={isA ? "A × 400V × 1.732 × 0.85 PF ÷ 1000" : "A × 230V × 0.85 PF ÷ 1000"} />
              <NumInput value={f.dayAmps} onChange={(v) => set("dayAmps", v)} min={0} step={1} unit="A" />
            </div>

            {/* Night load & backup — HIDDEN on Agricultural */}
            {!isA && (
              <>
                <div>
                  <FieldLabel text="Night Load (Amps)" hint="Used for battery bank sizing" />
                  <NumInput value={f.nightAmps} onChange={(v) => set("nightAmps", v)} min={0} step={1} unit="A" />
                </div>
                <div>
                  <FieldLabel text="Desired Night Backup (Hours)" hint="Autonomy hours — default 3h" />
                  <NumInput value={f.backupHours} onChange={(v) => set("backupHours", v)} min={0.5} step={0.5} unit="h" />
                </div>
              </>
            )}
          </div>
        </Card>
        </div>

        {/* ── 2. Efficiency ── */}
        <Card title="Efficiency Parameters" badge="Default: 80% each">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Slider label="Panel (effP)"    value={f.effP} onChange={(v) => set("effP", v)} />
            <Slider label="Inverter (effI)" value={f.effI} onChange={(v) => set("effI", v)} />
            {!isA && <Slider label="Battery (effB)" value={f.effB} onChange={(v) => set("effB", v)} />}
          </div>
        </Card>

        {/* ── 3. Technical Results ── */}
        <Card title="Technical Results">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatBox primary label="System Capacity"
              value={r.cap.toFixed(2) + " kW"}
              sub={isA ? "A × 400V × 1.732 × 0.85 PF ÷ 1000" : "A × 230V × 0.85 PF ÷ 1000"} />
            <StatBox label="Total Panels" value={String(r.panels)}
              sub={f.panelBrand + " · " + f.panelWattage + "W · effP " + f.effP + "% · effI " + f.effI + "%"} />
            <StatBox label="String Config"
              value={r.strings > 0 ? r.strings + " × " + r.pps : "—"}
              sub="Target: 10–14 panels/string" />
            {!isA && (
              <StatBox label={"Battery Bank (" + f.backupHours + "h)"}
                value={String(r.batt)}
                sub={"× 5.12kWh LiFePO4 · DoD 80% · effB " + f.effB + "%"} />
            )}
            <StatBox label="Inverter (1.5×)"
              value={r.inv + " kW"}
              sub={"Min " + (r.cap * SRG).toFixed(2) + " kW · surge + heat"} />
          </div>

          {/* Controller recommendation */}
          <div className="mt-3 rounded-xl border border-blue-100 px-4 py-3" style={{ background: "#eff6ff" }}>
            <p className="text-[10px] font-extrabold uppercase tracking-widest mb-0.5" style={{ color: NAVY, opacity: 0.5 }}>
              Controller Recommendation
            </p>
            <p className="text-sm font-bold" style={{ color: NAVY }}>{r.ctrl}</p>
          </div>

          {/* Inverter size indicator */}
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Standard Inverter Sizes</p>
            <div className="flex flex-wrap gap-2">
              {INVERTER_SIZES.map((s) => (
                <span key={s} className="text-xs font-bold px-3 py-1 rounded-full border transition-all"
                  style={s === r.inv
                    ? { background: NAVY, color: "#fff", border: `1px solid ${NAVY}` }
                    : { background: "#fff", color: "#94a3b8", border: "1px solid #e2e8f0" }}>
                  {s} kW{s === r.inv ? " ✓" : ""}
                </span>
              ))}
            </div>
          </div>
        </Card>

        {/* ── 4. Cost Breakdown ── */}
        <Card title="Cost Breakdown" badge="4 fields required">
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <FieldLabel text="Panels Cost ($)" />
                <NumInput value={f.costPanels} onChange={(v) => set("costPanels", v)} min={0} step={100} unit="$" />
              </div>
              {/* Batteries cost — HIDDEN on Agricultural */}
              {!isA && (
                <div>
                  <FieldLabel text="Batteries Cost ($)" />
                  <NumInput value={f.costBatteries} onChange={(v) => set("costBatteries", v)} min={0} step={100} unit="$" />
                </div>
              )}
              <div>
                <FieldLabel text="Inverter Cost ($)" />
                <NumInput value={f.costInverter} onChange={(v) => set("costInverter", v)} min={0} step={100} unit="$" />
              </div>
              <div>
                <FieldLabel text="Installation & Transport ($)" />
                <NumInput value={f.costInstall} onChange={(v) => set("costInstall", v)} min={0} step={50} unit="$" />
              </div>
            </div>

            {r.total > 0 && (
              <div className="space-y-3 pt-1">
                <CostBar label="Panels"       amount={f.costPanels}    pct={pct(f.costPanels)} />
                {!isA && <CostBar label="Batteries" amount={f.costBatteries} pct={pct(f.costBatteries)} />}
                <CostBar label="Inverter"     amount={f.costInverter}  pct={pct(f.costInverter)} />
                <CostBar label="Installation" amount={f.costInstall}   pct={pct(f.costInstall)} />
                <div className="flex items-center justify-between rounded-xl px-5 py-4 mt-2" style={{ background: NAVY }}>
                  <p className="text-sm font-bold text-white/60">Total System Cost</p>
                  <p className="text-2xl font-extrabold text-white">${r.total.toLocaleString("en-US")}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── 5. Financial + PDF ── */}
        <div id="financial-pdf" className="scroll-mt-24">
        <Card title="Financial Analysis & PDF Report">
          <div className="space-y-5">
            <div>
              <FieldLabel text="Expected Monthly Savings (USD)" hint="Estimated electricity bill reduction per month" />
              <NumInput value={f.savings} onChange={(v) => set("savings", v)} min={0} step={10} unit="$" />
            </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { l: "Annual Savings",  v: "$" + r.annual.toLocaleString("en-US") },
                  { l: "Payback Period",  v: r.payback.toFixed(1) + " yrs"          },
                  { l: "Annual ROI",      v: r.roi.toFixed(1) + "%"                  },
                ].map(({ l, v }) => (
                  <div key={l} className="border border-slate-200 rounded-xl p-3 text-center bg-slate-50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{l}</p>
                    <p className="text-lg font-extrabold" style={{ color: NAVY }}>{v}</p>
                  </div>
                ))}
              </div>

            <button onClick={() => exportPDF(
              f,
              r,
              tab,
              tab !== "residential" ? adv : undefined,
              tab !== "residential" ? advResult : undefined,
            )}
              className="w-full py-4 rounded-xl text-sm font-extrabold tracking-wide transition-all flex items-center justify-center gap-2"
              style={{ background: NAVY, color: "#fff", cursor: "pointer", opacity: 1 }}>
              ↓  Download Technical Proposal PDF
            </button>
          </div>
        </Card>
        </div>

        {/* ── Formula Reference ── */}
        <Card title={"Engineering Formulas — " + activeTab.en}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(isA ? [
              ["System Capacity (kW)", "(Amps × 400V × 1.732 × 0.85 PF) / 1000"],
              ["Total Panels",         "(Capacity × 1000) / (Wattage × effP × effI)"],
              ["Inverter Size",        "Next std size ≥ Capacity × 1.5 (surge + heat)"],
              ["String Target",        "10 – 14 panels per string"],
            ] : [
              ["System Capacity (kW)", "(Day Amps × 230V × 0.85 PF) / 1000"],
              ["Total Panels",         "(Capacity × 1000) / (Wattage × effP × effI)"],
              ["Battery Units",        "(Night A × 230V × Hours) / (5.12kWh × 0.8 × effB)"],
              ["Inverter Size",        "Next std size ≥ Capacity × 1.5 (surge + heat)"],
            ]).map(([lbl, formula]) => (
              <div key={lbl}>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 mb-1">{lbl}</p>
                <p className="font-mono text-xs rounded-lg px-3 py-2 border border-slate-200 text-slate-600 leading-relaxed"
                  style={{ background: "#f8fafc" }}>{formula}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="About Us — من نحن" badge="Since 1996">
          <div className="space-y-4 text-slate-700 leading-relaxed">
            <h3 className="text-lg font-extrabold" style={{ color: NAVY }}>
              الريادة في الحلول التقنية والطاقة المتجددة منذ 1996
            </h3>
            <p className="text-sm">
              نحن في شركة الخوارزمي لتقنيات الحاسوب والطاقة الشمسية، نمثل مسيرة مهنية بدأت منذ عام 1996، تخصصنا خلالها في بناء
              جسور الثقة عبر تقديم حلول متكاملة في مجالات تكنولوجيا المعلومات، الاتصالات، والطاقة الكهربائية.
            </p>
            <p className="text-sm">
              على مدار أكثر من عقدين من الزمان، التزمنا بتوفير أرقى الخدمات الهندسية والتقنية لكافة قطاعات المجتمع العراقي. واليوم،
              ندمج خبرتنا العريقة في الأنظمة الإلكترونية وأنظمة السيطرة مع أحدث تكنولوجيا الطاقة الشمسية، لنقدم لعملائنا في القطاعات
              السكنية، الصناعية، والزراعية حلولاً طاقوية ذكية، مستدامة، ومبنية على أسس هندسية دقيقة.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Vision</p>
                <p className="text-sm">تمكين المجتمع العراقي من استغلال الطاقة النظيفة بأعلى كفاءة تقنية ممكنة.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Mission</p>
                <p className="text-sm">تحويل التحديات التقنية إلى حلول واقعية تخدم بيئة العمل والحياة اليومية.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatBox label="Establishment" value="Since 1996" />
              <StatBox label="Core Specialties" value="IT · Comms · Power" />
              <StatBox label="Firm Identity" value="AKZ Iraq Sun Energy" />
            </div>
          </div>
        </Card>

        <Card title="Help Center — المساعدة" badge="FAQ for Installers">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="q1">
              <AccordionTrigger>كيف تعمل حاسبة الـ Strings؟</AccordionTrigger>
              <AccordionContent>
                تعتمد الحاسبة على جهد اللوح في الظروف الباردة (Voc) والساخنة (Vmp)، وتقارنها مع حدود الإنفرتر (Max DC و MPPT Min/Max)
                لإعطاء مدى آمن لعدد الألواح في كل string.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2">
              <AccordionTrigger>ما هي المعايير المستخدمة في حساب فاقد الجهد؟</AccordionTrigger>
              <AccordionContent>
                يتم تقييم الأداء في وضع Installer Pro عبر تأثير الحرارة على الجهد (درجة حرارة عراقية افتراضية) لضمان سلامة الجهد
                والكفاءة التشغيلية ضمن مجال MPPT.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3">
              <AccordionTrigger>كيف يمكنني تصدير التقرير الفني كـ PDF؟</AccordionTrigger>
              <AccordionContent>
                من قسم Financial Analysis &amp; PDF Report اضغط زر تنزيل التقرير. يتضمن التقرير النتائج الفنية، المالية، وملحق Installer
                المتقدم (للوضع الصناعي والزراعي).
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        <Card title="Feedback System — الملاحظات الفنية" badge="For Professional Users">
          <form onSubmit={submitFeedback} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel text="الاسم الثلاثي" />
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium bg-white"
                  value={feedback.name}
                  onChange={(e) => setFeedback((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <FieldLabel text="التخصص" hint="مهندس / فني / صاحب شركة" />
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium bg-white"
                  value={feedback.profession}
                  onChange={(e) => setFeedback((p) => ({ ...p, profession: e.target.value }))}
                  required
                >
                  <option value="">اختر التخصص</option>
                  <option value="مهندس">مهندس</option>
                  <option value="فني">فني</option>
                  <option value="صاحب شركة">صاحب شركة</option>
                </select>
              </div>
            </div>
            <div>
              <FieldLabel text="الملاحظات والاقتراحات الفنية لتطوير النسخة القادمة" />
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-3 text-sm font-medium bg-white min-h-28"
                value={feedback.comments}
                onChange={(e) => setFeedback((p) => ({ ...p, comments: e.target.value }))}
                required
              />
            </div>
            <button
              type="submit"
              className="rounded-lg px-5 py-2.5 text-sm font-bold text-white"
              style={{ background: NAVY }}
            >
              Submit
            </button>
          </form>
        </Card>

      </main>

      {/* ── Footer ── */}
      <footer className="py-8 mt-4" style={{ background: NAVY }}>
        <div className="max-w-4xl mx-auto px-5 grid grid-cols-1 sm:grid-cols-3 gap-5 items-start">
          <div className="flex items-center gap-3">
            <img src={akzLogo} alt="AKZ Iraq Sun Energy" className="w-12 h-12 rounded-lg object-cover border border-white/20" />
            <div>
              <p className="text-white font-extrabold text-sm tracking-wide">AKZ Iraq Sun Energy</p>
              <p className="font-semibold text-sm mt-0.5" style={{ color: "#f59e0b" }}>Since 1996</p>
            </div>
          </div>
          <div>
            <p className="text-white/90 text-sm font-bold mb-1">Address</p>
            <p className="text-white/70 text-xs">Baghdad, Iraq</p>
            <p className="text-white/70 text-xs">Baghdad-Sinaa Street Near Univ. of Technology</p>
          </div>
          <div>
            <p className="text-white/90 text-sm font-bold mb-1">Contact</p>
            <div className="flex flex-col gap-1 text-xs">
              <a className="text-white/70 hover:text-white" href="mailto:info@akz-iq.com">info@akz-iq.com</a>
              <a className="text-white/70 hover:text-white" href="tel:+9640000000000">+964 000 000 0000</a>
              <a className="text-white/70 hover:text-white" href="https://www.linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
