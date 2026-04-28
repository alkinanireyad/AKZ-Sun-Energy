import { useState, useCallback, useMemo, type ReactNode } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import residentialImg from "./residential.png";
import industrialImg from "./industrial.png";
import agriculturalImg from "./agricultural.png";
import akzLogo from "./AKZ_Logo.png";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import InstallationAssistant from "@/components/InstallationAssistant";

// ── Arabic Tooltips Map ───────────────────────────────────────────────────────
export const AR_TIPS: Record<string, string> = {
  "Panel Brand":
    "اختر العلامة التجارية للألواح الشمسية. Longi و Jinko و Canadian Solar من أكثر الماركات موثوقيةً وانتشاراً في السوق العراقي.",
  "Panel Wattage":
    "قدرة اللوح الشمسي بالواط. القيمة الافتراضية 620W وهي مناسبة للألواح الحديثة عالية الكفاءة. كلما زادت القدرة قلّ عدد الألواح المطلوبة.",
  "Day Load (Amps)":
    "إجمالي التيار المستهلك خلال النهار بالأمبير. لحسابه: جمع قدرات الأجهزة (واط) ÷ 230 فولت. مثال: 4600W ÷ 230V = 20A.",
  "3-Phase Load (Amps)":
    "التيار المستهلك للحمل الثلاثي الأوجه بالأمبير. يُستخدم لتشغيل المضخات والمحركات الكبيرة على جهد 400V ثلاثي الأوجه.",
  "Night Load (Amps)":
    "التيار المستهلك خلال الليل أو عند انقطاع الكهرباء. يُستخدم لحساب سعة بنك البطاريات اللازم للنسخ الاحتياطي.",
  "Desired Night Backup (Hours)":
    "عدد الساعات التي تريد الاستمرار فيها بالعمل عند انقطاع الكهرباء. القيمة الافتراضية 3 ساعات وهي مناسبة لمعظم الاستخدامات السكنية.",
  "Panel (effP)":
    "كفاءة اللوح الشمسي الفعلية مع مرور الوقت والأتربة. القيمة 80% تأخذ بالحسبان الفاقد الحراري والأتربة والتقادم الطبيعي.",
  "Inverter (effI)":
    "كفاءة الإنفرتر في تحويل التيار المستمر DC إلى تيار متردد AC. معظم الإنفرترات الحديثة تعمل بكفاءة 95-98% لكن نأخذ 80% كهامش أمان.",
  "Battery (effB)":
    "كفاءة البطارية في الشحن والتفريغ. هذه القيمة لا تؤثر على حساب عدد البطاريات (الذي يعتمد على DoD فقط) بل على تقدير الخسائر.",
  "Panels Cost ($)":
    "التكلفة الإجمالية لمجموعة الألواح الشمسية شاملةً إطارات التثبيت والكابلات DC والموصلات.",
  "Batteries Cost ($)":
    "التكلفة الإجمالية لبنك البطاريات. بطاريات LiFePO4 أعلى سعراً لكنها أطول عمراً (10-15 سنة) مقارنةً بالرصاص الحامض.",
  "Inverter Cost ($)":
    "تكلفة الإنفرتر مع وحدة التحكم MPPT. يُفضّل اختيار إنفرتر هجين يدعم البطاريات والشبكة في آنٍ واحد.",
  "Installation & Transport ($)":
    "تكاليف التركيب والشحن والنقل والتوصيلات الكهربائية وعمل فريق التركيب.",
  "Expected Monthly Savings (USD)":
    "تقديرك للوفورات الشهرية في فاتورة الكهرباء أو تكاليف الديزل بعد تشغيل المنظومة. تُستخدم لحساب فترة الاسترداد والعائد السنوي.",
  "Voc (Open Circuit Voltage)":
    "جهد الدائرة المفتوحة للوح الشمسي (من datasheet). مهم لحساب أقصى جهد للصف الواحد ومقارنته بحد الإنفرتر الأقصى.",
  "Vmp (Max Power Voltage)":
    "جهد نقطة الطاقة القصوى. يُستخدم للتحقق من أن جهد صف الألواح يقع ضمن نطاق MPPT للإنفرتر.",
  "Imp (Max Power Current)":
    "تيار نقطة الطاقة القصوى. يُستخدم لحساب إجمالي تيار MPPT ومقارنته بالحد الأقصى للإنفرتر.",
  "Isc (Short Circuit Current)":
    "تيار الدائرة القصيرة. مهم لاختيار أحجام الكابلات والمنصهرات (الفيوزات) المناسبة.",
  "Max PV Voltage":
    "أقصى جهد DC يتحمله مدخل الإنفرتر من الألواح. يجب أن يكون أعلى من Voc × عدد الألواح في الصف مع مراعاة معامل درجة الحرارة الباردة.",
  "MPPT Min Voltage":
    "أدنى جهد يعمل فيه MPPT بكفاءة. يجب أن يكون Vmp للصف أعلى من هذه القيمة في أشد أوقات الحرارة.",
  "MPPT Max Voltage":
    "أقصى جهد لنطاق عمل MPPT. يجب أن يكون Vmp للصف أقل من هذه القيمة لضمان تتبع نقطة الطاقة القصوى.",
  "Max MPPT Current":
    "أقصى تيار يقبله مدخل MPPT الواحد. مجموع تيارات الأوتار المتوازية يجب ألا يتجاوز هذه القيمة.",
  "Number of MPPTs":
    "عدد مداخل MPPT في الإنفرتر. كلما زاد العدد زادت المرونة في توزيع الألواح وتحسّن الأداء عند وجود ظلال جزئية.",
};

// ── Tooltip Component ─────────────────────────────────────────────────────────
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block w-full"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && text && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-72 max-w-xs"
          style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.18))" }}>
          <div className="rounded-xl px-4 py-3 text-right" dir="rtl"
            style={{ background: "#001f3f", border: "1px solid rgba(245,158,11,0.3)" }}>
            <p className="text-xs text-white/90 leading-relaxed font-medium"
              style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>{text}</p>
            <div className="absolute left-4 top-full w-0 h-0"
              style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #001f3f" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const PANEL_BRANDS = ["Longi", "Jinko", "Canadian Solar", "Aiko", "Risen", "Philadelphia", "Ecoshield"];
export const INVERTER_SIZES = [5, 8, 10, 12, 15, 20, 30, 50];
export const NAVY = "#001f3f";
export const AMBER = "#f59e0b";
const V1 = 230;
const V3 = 400;
const SQ3 = 1.732;
const PF = 0.85;
const BKWH = 5.12;
const DOD = 0.8;
const SRG = 1.5;
export const PSH = 5.5; // Peak Sun Hours — Baghdad avg

type Tab = "residential" | "commercial" | "agricultural";

export const TABS: { id: Tab; ar: string; en: string; icon: string; spec: string }[] = [
  { id: "residential", ar: "سكني",  en: "Residential",  icon: "🏠", spec: "1-Phase · 230V · Battery Backup" },
  { id: "commercial",  ar: "تجاري", en: "Commercial",   icon: "🏢", spec: "High Load · 3-Phase · Battery Backup" },
  { id: "agricultural",ar: "زراعي", en: "Agricultural", icon: "🌾", spec: "3-Phase · 400V Pump · No Batteries" },
];

export const TAB_IMAGES: Record<Tab, string> = {
  residential:  residentialImg,
  commercial:   industrialImg,
  agricultural: agriculturalImg,
};

// ── Interfaces ────────────────────────────────────────────────────────────────
interface InverterSpecs {
  maxPvVolts: number;
  minMpptVolts: number;
  maxMpptVolts: number;
  maxMpptCurrent: number;
  mpptCount: number;
}

interface PanelSpecs {
  voc: number;
  vmp: number;
  imp: number;
  isc: number;
}

interface Form {
  panelBrand: string; panelWattage: number;
  dayAmps: number; nightAmps: number; backupHours: number;
  effP: number; effI: number; effB: number;
  costPanels: number; costBatteries: number; costInverter: number; costInstall: number;
  savings: number;
  invSpecs: InverterSpecs;
  pnlSpecs: PanelSpecs;
}

interface Calc {
  cap: number; panels: number; strings: number; pps: number;
  batt: number; inv: number; ctrl: string;
  total: number; annual: number; payback: number; roi: number;
  dailyWh: number;
}

interface MpptDesign {
  seriesPerString: number;
  strings: number;
  stringsPerMppt: number;
  totalCurrent: number;
  arrayVoc: number;
  arrayVmp: number;
  utilization: number;
  warnings: string[];
  score: number;
}

// ── Default Form ──────────────────────────────────────────────────────────────
export const initForm = (): Form => ({
  panelBrand: "Longi", panelWattage: 620,
  dayAmps: 20, nightAmps: 10, backupHours: 3,
  effP: 80, effI: 80, effB: 80,
  costPanels: 0, costBatteries: 0, costInverter: 0, costInstall: 0,
  savings: 0,
  invSpecs: { maxPvVolts: 500, minMpptVolts: 150, maxMpptVolts: 450, maxMpptCurrent: 18, mpptCount: 2 },
  pnlSpecs: { voc: 53, vmp: 44, imp: 13.8, isc: 14.6 },
});

// ── Core Calculation ──────────────────────────────────────────────────────────
export function run(f: Form, tab: Tab): Calc {
  const ep = f.effP / 100, ei = f.effI / 100;
  const cap = tab === "agricultural"
    ? (f.dayAmps * V3 * SQ3 * PF) / 1000
    : (f.dayAmps * V1 * PF) / 1000;

  const dailyWh = cap * 1000 * (tab === "agricultural" ? 8 : 6);
  const denom = f.panelWattage * ep * ei;
  const panels = denom > 0 ? Math.ceil((cap * 1000) / denom) : 0;

  let strings = 1, pps = panels;
  for (let s = 1; s <= panels; s++) {
    const p = Math.ceil(panels / s);
    if (p >= 10 && p <= 14) { strings = s; pps = p; break; }
  }
  if (pps < 10 || pps > 14) {
    let bestD = Math.abs(panels - 12);
    for (let s = 2; s <= panels; s++) {
      const p = Math.ceil(panels / s), d = Math.abs(p - 12);
      if (d < bestD) { bestD = d; strings = s; pps = p; }
    }
  }

  const batt = tab === "agricultural" || f.nightAmps <= 0 ? 0
    : Math.ceil((f.nightAmps * V1 * f.backupHours) / (BKWH * 1000 * DOD));
  const minInv = cap * SRG;
  const inv = INVERTER_SIZES.find((s) => s >= minInv) ?? INVERTER_SIZES[INVERTER_SIZES.length - 1];
  const ctrl = tab === "agricultural" ? "Dual MPPT VFD Inverter (3-Phase Pump Drive)"
    : tab === "commercial" ? inv >= 20 ? "Multiple MPPT Controllers" : "Dual MPPT Inverter"
    : panels > 12 ? "Dual MPPT Inverter" : "Single MPPT Inverter";

  const battC = tab === "agricultural" ? 0 : f.costBatteries;
  const total = f.costPanels + battC + f.costInverter + f.costInstall;
  const annual = f.savings * 12;
  const payback = annual > 0 ? total / annual : 0;
  const roi = total > 0 && annual > 0 ? (annual / total) * 100 : 0;
  return { cap, panels, strings, pps, batt, inv, ctrl, total, annual, payback, roi, dailyWh };
}

// ── MPPT Auto-Design Engine ───────────────────────────────────────────────────
export function calcMppt(f: Form, panels: number): MpptDesign {
  const inv = f.invSpecs;
  const pnl = f.pnlSpecs;
  const warnings: string[] = [];
  const maxSeries = Math.floor(inv.maxPvVolts / (pnl.voc * 1.15));
  const minSeries = Math.ceil(inv.minMpptVolts / pnl.vmp);

  let best: { s: number; strings: number; stringsPerMppt: number; current: number; util: number } | null = null;
  for (let s = minSeries; s <= maxSeries; s++) {
    const totalStrings = Math.floor(panels / s);
    if (totalStrings < 1) continue;
    const stringsPerMppt = Math.ceil(totalStrings / inv.mpptCount);
    const current = stringsPerMppt * pnl.imp;
    if (current <= inv.maxMpptCurrent) {
      const util = (s * totalStrings) / panels;
      if (!best || util > best.util) best = { s, strings: totalStrings, stringsPerMppt, current, util };
    }
  }

  if (!best) {
    warnings.push("⚠ No valid MPPT configuration found — check inverter specs");
    return { seriesPerString: 0, strings: 0, stringsPerMppt: 0, totalCurrent: 0, arrayVoc: 0, arrayVmp: 0, utilization: 0, warnings, score: 0 };
  }

  const arrayVoc = best.s * pnl.voc;
  const arrayVmp = best.s * pnl.vmp;
  if (arrayVoc > inv.maxPvVolts) warnings.push("⚠ Array Voc exceeds inverter max PV voltage");
  if (arrayVmp > inv.maxMpptVolts) warnings.push("⚠ Array Vmp exceeds MPPT max voltage");
  if (arrayVmp < inv.minMpptVolts) warnings.push("⚠ Array Vmp below MPPT min voltage");
  if (best.current > inv.maxMpptCurrent) warnings.push("⚠ MPPT current overload");

  const score = Math.max(0, 100 - warnings.length * 15 - Math.abs(best.s - 12) * 2);
  return { seriesPerString: best.s, strings: best.strings, stringsPerMppt: best.stringsPerMppt,
    totalCurrent: best.current, arrayVoc, arrayVmp, utilization: best.util, warnings, score };
}

// ── PDF Export ────────────────────────────────────────────────────────────────
export async function exportPDF(f: Form, r: Calc, mppt: MpptDesign, tab: Tab) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 18, CW = W - ML * 2;
  const isA = tab === "agricultural";
  const tabLabel = tab === "residential" ? "Residential — 1-Phase 230V"
    : tab === "commercial" ? "Commercial — High Load 3-Phase"
    : "Agricultural — 3-Phase 400V Pump";

  // ── Header background ──
  doc.setFillColor(0, 51, 102); doc.rect(0, 0, W, 52, "F");
  doc.setFillColor(0, 31, 63); doc.rect(0, 49, W, 3, "F");

  // ── Logo ──
  try {
    const logoImg = new Image();
    logoImg.src = akzLogo;
    await new Promise<void>((resolve) => {
      if (logoImg.complete) { resolve(); return; }
      logoImg.onload = () => resolve();
      logoImg.onerror = () => resolve();
      setTimeout(resolve, 2000);
    });
    doc.addImage(logoImg, "PNG", ML, 4, 32, 32);
  } catch (_) { /* skip logo if it fails */ }

  // ── Company name ──
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("AKZ & AL-KHWARIZMI", ML + 33, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.setTextColor(245, 158, 11);
  doc.text("Solar Energy Solutions \u2014 Technical Proposal", ML + 33, 26);

  // ── System & date (right-aligned) ──
  doc.setTextColor(200, 215, 230); doc.setFontSize(8);
  doc.text("System: " + tabLabel, W - ML, 35, { align: "right" });
  doc.text("Date: " + new Date().toLocaleDateString("en-GB"), W - ML, 43, { align: "right" });

  let y = 65;
  const sec = (title: string) => {
    if (y > H - 40) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 31, 63);
    doc.text(title, ML, y); y += 2;
    doc.setDrawColor(0, 31, 63); doc.setLineWidth(0.4);
    doc.line(ML, y, ML + CW, y); y += 7;
  };

  sec("1. Technical System Overview");
  doc.setFontSize(9); doc.setTextColor(50, 50, 50); doc.setFont("helvetica", "normal");
  const specs: [string, string][] = [
    ["System Capacity", r.cap.toFixed(2) + " kW"],
    ["Daily Energy Estimate", (r.dailyWh / 1000).toFixed(2) + " kWh/day"],
    ["Total Solar Panels", r.panels + " panels (" + f.panelBrand + " · " + f.panelWattage + "W)"],
    ["String Configuration", r.strings > 0 ? r.strings + " strings × " + r.pps + " panels" : "—"],
    ["Inverter Size", r.inv + " kW (min: " + (r.cap * SRG).toFixed(2) + " kW)"],
    ["Controller", r.ctrl],
    ...(!isA ? [["Battery Bank (" + f.backupHours + "h)", r.batt + " × 5.12kWh LiFePO4 (DoD 80% → 4.1kWh usable)"] as [string, string]] : []),
  ];
  specs.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
    doc.text(label + ":", ML, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
    doc.text(value, ML + 60, y); y += 6;
  });
  y += 4;

  if (mppt.seriesPerString > 0) {
    sec("2. MPPT Auto-Design Analysis");
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 50);
    const rows: [string, string][] = [
      ["Panels per String (Series)", String(mppt.seriesPerString)],
      ["Total Strings (Parallel)", String(mppt.strings)],
      ["Strings per MPPT Input", String(mppt.stringsPerMppt)],
      ["Array Voc", mppt.arrayVoc.toFixed(1) + " V"],
      ["Array Vmp", mppt.arrayVmp.toFixed(1) + " V"],
      ["Total MPPT Current", mppt.totalCurrent.toFixed(1) + " A"],
      ["Panel Utilization", (mppt.utilization * 100).toFixed(1) + "%"],
      ["Design Confidence Score", mppt.score + " / 100"],
    ];
    rows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
      doc.text(label + ":", ML, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
      doc.text(value, ML + 75, y); y += 6;
    });
    if (mppt.warnings.length > 0) {
      y += 2; doc.setFont("helvetica", "bold"); doc.setTextColor(180, 50, 0);
      mppt.warnings.forEach((w) => { doc.text(w, ML, y); y += 5.5; });
    }
    y += 4;
  }

  const pricingNum = mppt.seriesPerString > 0 ? "3" : "2";
  sec(pricingNum + ". Component Breakdown & Pricing");
  const tableData: string[][] = [
    ["Solar Panels (" + f.panelBrand + " · " + f.panelWattage + "W)", "1 Set", "$ " + f.costPanels.toLocaleString(), "$ " + f.costPanels.toLocaleString()],
    ["Inverter Unit (" + r.inv + " kW)", "1 Unit", "$ " + f.costInverter.toLocaleString(), "$ " + f.costInverter.toLocaleString()],
    ["Installation & Logistics", "1 Job", "$ " + f.costInstall.toLocaleString(), "$ " + f.costInstall.toLocaleString()],
  ];
  if (!isA) tableData.push(["Battery Bank (" + r.batt + " units LiFePO4)", "1 Set", "$ " + f.costBatteries.toLocaleString(), "$ " + f.costBatteries.toLocaleString()]);
  autoTable(doc, {
    startY: y, head: [["Product / Service", "Qty", "Unit Price", "Total"]], body: tableData,
    foot: [["", "", "TOTAL SYSTEM COST", "$ " + r.total.toLocaleString()]],
    theme: "striped",
    headStyles: { fillColor: [0, 31, 63], fontSize: 9, fontStyle: "bold" },
    footStyles: { fillColor: [245, 158, 11], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: ML, right: ML },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  if (r.annual > 0) {
    const finNum = mppt.seriesPerString > 0 ? "4" : "3";
    sec(finNum + ". Financial Analysis");
    autoTable(doc, {
      startY: y,
      body: [
        ["Monthly Savings", "$ " + f.savings.toLocaleString()],
        ["Annual Savings", "$ " + r.annual.toLocaleString()],
        ["Total Investment", "$ " + r.total.toLocaleString()],
        ["Payback Period", r.payback.toFixed(1) + " years"],
        ["Annual ROI", r.roi.toFixed(1) + "%"],
      ],
      theme: "plain", bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: "bold", textColor: [0, 31, 63] }, 1: { halign: "right" } },
      margin: { left: ML, right: ML },
    });
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Footer bar
    doc.setFillColor(0, 31, 63); doc.rect(0, H - 18, W, 18, "F");
    doc.setFillColor(245, 158, 11); doc.rect(0, H - 18, W, 1.5, "F");
    // Company name
    doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text("AKZ & AL-KHWARIZMI  |  Solar Energy Solutions", ML, H - 11);
    // Designer credit
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.setTextColor(245, 158, 11);
    doc.text("Designed by Eng. Riyadh Noori", ML, H - 5);
    // Page number
    doc.setTextColor(180, 200, 220); doc.setFontSize(7.5);
    doc.text("Page " + i + " / " + totalPages, W - ML, H - 5, { align: "right" });
  }
  doc.save(`AKZ_Solar_Proposal_${tab}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  const tip = AR_TIPS[text] ?? "";
  return (
    <div className="mb-1.5 flex items-start gap-1.5 group/label">
      <div className="flex-1">
        <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: NAVY }}>{text}</p>
        {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
      </div>
      {tip && (
        <div className="relative mt-0.5 shrink-0">
          <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black cursor-help select-none"
            style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b55" }}
            title="">?</span>
        </div>
      )}
    </div>
  );
}

function NumInput({ value, onChange, min, step, unit, tipKey }: {
  value: number; onChange: (v: number) => void; min: number; step: number; unit: string; tipKey?: string;
}) {
  const tip = tipKey ? (AR_TIPS[tipKey] ?? "") : "";
  return (
    <Tooltip text={tip}>
      <div className="relative">
        <input type="number" value={value} min={min} step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-sm font-semibold text-slate-800 bg-white focus:outline-none transition"
          onFocus={(e) => (e.target.style.borderColor = NAVY)}
          onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{unit}</span>
      </div>
    </Tooltip>
  );
}

function SelInput({ value, onChange, opts, tipKey }: { value: string; onChange: (v: string) => void; opts: string[]; tipKey?: string }) {
  const tip = tipKey ? (AR_TIPS[tipKey] ?? "") : "";
  return (
    <Tooltip text={tip}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white focus:outline-none transition"
        onFocus={(e) => (e.target.style.borderColor = NAVY)}
        onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
      >
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Tooltip>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const tip = AR_TIPS[label] ?? "";
  return (
    <Tooltip text={tip}>
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: NAVY }}>{label}</p>
          <span className="text-xs font-extrabold text-white px-2.5 py-0.5 rounded-full" style={{ background: NAVY }}>{value}%</span>
        </div>
        <input type="range" min={50} max={100} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full cursor-pointer" style={{ accentColor: NAVY }} />
        <div className="flex justify-between text-[10px] text-slate-300 mt-1"><span>50%</span><span>100%</span></div>
      </div>
    </Tooltip>
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
  if (primary) return (
    <div className="rounded-xl px-4 py-3 col-span-2" style={{ background: NAVY }}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">{label}</p>
      <p className="text-2xl font-extrabold text-white">{value}</p>
      {sub && <p className="text-xs text-white/40 mt-0.5">{sub}</p>}
    </div>
  );
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
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: Math.min(100, pct) + "%", background: NAVY }} />
      </div>
    </div>
  );
}

// ── System Diagram with Real Background Image ─────────────────────────────────
function DiagramPlaceholder({ tab }: { tab: Tab }) {
  const flows: Record<Tab, { steps: string[]; color: string; note: string; label: string }> = {
    residential: {
      color: "#3b82f6", label: "1-Phase 230V",
      steps: ["☀️ Solar Panels", "⚡ MPPT Inverter", "🔋 Battery Bank", "🏠 Home (230V)"],
      note: "Battery backup included for night & grid-outage",
    },
    commercial: {
      color: "#8b5cf6", label: "3-Phase High Load",
      steps: ["☀️ Solar Array", "⚡ 3-Phase Inverter", "🔋 Battery Storage", "🏢 Commercial Load"],
      note: "High-load 3-phase system with battery backup",
    },
    agricultural: {
      color: "#10b981", label: "3-Phase 400V Pump",
      steps: ["☀️ Solar Panels", "⚡ VFD Inverter", "💧 3-Phase Pump (400V)", "🌾 Irrigation"],
      note: "Direct pump drive via VFD — no battery storage",
    },
  };
  const d = flows[tab];
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="relative h-52 md:h-64">
        <img src={TAB_IMAGES[tab]} alt={tab + " solar system"}
          className="absolute inset-0 w-full h-full object-cover" />
        <div className="relative z-10 h-full flex flex-col justify-between p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-black text-base tracking-tight">System Diagram</p>
              <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mt-0.5">{d.label}</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/20 text-white/60">schematic</span>
          </div>
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {d.steps.map((step, i) => (
              <div key={step} className="flex items-center gap-1">
                <div className="text-xs font-bold px-3 py-1.5 rounded-xl text-center whitespace-nowrap backdrop-blur-sm"
                  style={{ border: "1.5px solid " + d.color + "99", color: "#fff", background: d.color + "33" }}>
                  {step}
                </div>
                {i < d.steps.length - 1 && <span className="text-white/40 font-bold">→</span>}
              </div>
            ))}
          </div>
          <p className="text-center text-[10px] text-white/50 font-medium">{d.note}</p>
        </div>
      </div>
    </div>
  );
}

// ── MPPT Panel ────────────────────────────────────────────────────────────────
function MpptPanel({ mppt, mpptCount }: { mppt: MpptDesign; mpptCount: number }) {
  if (mppt.seriesPerString === 0) return (
    <div className="rounded-xl border border-red-200 px-4 py-3 bg-red-50">
      <p className="text-sm font-bold text-red-700">No valid MPPT configuration — check inverter specs</p>
    </div>
  );
  const scoreColor = mppt.score >= 80 ? "#10b981" : mppt.score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl px-4 py-3 border border-slate-200 bg-slate-50">
        <div className="text-center min-w-[64px]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Confidence</p>
          <p className="text-3xl font-black" style={{ color: scoreColor }}>{mppt.score}</p>
          <p className="text-[10px] text-slate-400">/ 100</p>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {[
            ["Panels/String", mppt.seriesPerString],
            ["Total Strings", mppt.strings],
            ["Strings/MPPT", mppt.stringsPerMppt],
            ["Array Voc", mppt.arrayVoc.toFixed(0) + " V"],
            ["Array Vmp", mppt.arrayVmp.toFixed(0) + " V"],
            ["MPPT Current", mppt.totalCurrent.toFixed(1) + " A"],
            ["Utilization", (mppt.utilization * 100).toFixed(0) + "%"],
          ].map(([l, v]) => (
            <div key={l as string} className="flex justify-between gap-2 text-xs">
              <span className="text-slate-400 font-bold">{l}</span>
              <span className="font-extrabold" style={{ color: NAVY }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">MPPT String Layout</p>
        {Array.from({ length: mpptCount }).map((_, mi) => (
          <div key={mi} className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 w-14 shrink-0">MPPT {mi + 1}</span>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: mppt.stringsPerMppt }).map((_, si) => (
                <div key={si} className="flex gap-0.5">
                  {Array.from({ length: Math.min(mppt.seriesPerString, 20) }).map((_, pi) => (
                    <div key={pi} className="w-3 h-4 rounded-sm border border-amber-400"
                      style={{ background: AMBER + "55" }} />
                  ))}
                  {si < mppt.stringsPerMppt - 1 && <div className="w-px bg-slate-200 mx-0.5" />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {mppt.warnings.length > 0 && (
        <div className="space-y-1.5">
          {mppt.warnings.map((w, i) => (
            <div key={i} className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── ReadMe Modal ──────────────────────────────────────────────────────────────
function ReadMeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-3xl border-b border-slate-100"
          style={{ background: NAVY }}>
          <div>
            <p className="text-white font-black text-lg">📖 اقرأني — دليل الاستخدام</p>
            <p className="text-white/50 text-xs mt-0.5">SolarDesigner · AKZ Iraq Solar</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition text-xl font-bold">×</button>
        </div>
        <div className="p-6 space-y-5" dir="rtl" style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>

          <section className="space-y-2">
            <h3 className="font-black text-base" style={{ color: NAVY }}>🎯 ما هو هذا البرنامج؟</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              SolarDesigner هو أداة هندسية متخصصة لتصميم منظومات الطاقة الشمسية الكهروضوئية (PV).
              يساعدك على حساب حجم المنظومة المطلوبة، وعدد الألواح والبطاريات والإنفرتر،
              وتقدير التكاليف وفترة استرداد الاستثمار، ثم تصدير تقرير PDF احترافي جاهز للعرض على العميل.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-black text-base" style={{ color: NAVY }}>📋 خطوات الاستخدام</h3>
            {[
              ["١", "اختر نوع المنظومة", "سكني (1-Phase 230V) أو تجاري (3-Phase) أو زراعي (ضخ مياه 400V)"],
              ["٢", "أدخل بيانات الحمل", "التيار النهاري بالأمبير، وللسكني والتجاري أضف الحمل الليلي وساعات النسخ الاحتياطي"],
              ["٣", "اضبط كفاءة المكونات", "القيم الافتراضية 80% مناسبة لمعظم الحالات"],
              ["٤", "أدخل التكاليف", "أسعار الألواح والبطاريات والإنفرتر والتركيب بالدولار"],
              ["٥", "أدخل التوفير الشهري", "لحساب فترة الاسترداد والعائد على الاستثمار"],
              ["٦", "صدّر التقرير", "اضغط زر تحميل التقرير للحصول على PDF احترافي جاهز للعرض"],
            ].map(([num, title, desc]) => (
              <div key={num as string} className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black"
                  style={{ background: NAVY }}>{num}</span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-2xl p-4 space-y-2" style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
            <h3 className="font-black text-sm text-amber-800">⚡ الوضع الاحترافي (Pro Mode)</h3>
            <p className="text-xs text-amber-700 leading-relaxed">
              فعّل "Pro Mode" من الشريط العلوي للحصول على محرك MPPT Auto-Design.
              أدخل مواصفات datasheet اللوح والإنفرتر لتحصل على تصميم أوتار MPPT المثالي
              مع درجة ثقة للتصميم وتحذيرات إن وُجدت.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-black text-base" style={{ color: NAVY }}>🔢 المعادلات الهندسية المستخدمة</h3>
            <div className="space-y-1.5">
              {[
                ["القدرة الكلية (kW)", "A × V × PF(0.85) ÷ 1000"],
                ["عدد الألواح", "(القدرة × 1000) ÷ (قدرة اللوح × effP × effI)"],
                ["عدد البطاريات", "(A_ليل × 230V × الساعات) ÷ (5120Wh × 0.8 DoD)"],
                ["حجم الإنفرتر", "أقرب مقاس قياسي ≥ القدرة × 1.5 (معامل الانطلاق)"],
              ].map(([lbl, eq]) => (
                <div key={lbl as string} className="flex gap-2 items-start">
                  <span className="text-xs font-bold text-slate-500 w-36 shrink-0">{lbl}:</span>
                  <code className="text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded font-mono">{eq}</code>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl p-4 space-y-1" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
            <h3 className="font-black text-sm" style={{ color: NAVY }}>💡 نصائح سريعة</h3>
            <ul className="text-xs text-slate-600 space-y-1 leading-relaxed">
              <li>• مرّر الفأرة على أي حقل لقراءة شرحه بالعربية</li>
              <li>• بيانات كل تبويب (سكني/تجاري/زراعي) محفوظة بشكل مستقل</li>
              <li>• استخدم 5.5 ساعة ذروة شمسية كمعدل لمنطقة بغداد</li>
              <li>• أضف 20% هامش أمان إضافي للمشاريع التجارية الكبيرة</li>
            </ul>
          </section>

        </div>
        <div className="px-6 pb-6">
          <button onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition hover:opacity-90"
            style={{ background: NAVY }}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}

// ── About Modal ───────────────────────────────────────────────────────────────
function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 rounded-t-3xl border-b border-slate-100"
          style={{ background: "linear-gradient(135deg, #001f3f 0%, #003366 100%)" }}>
          <div>
            <p className="text-white font-black text-lg">🌍 حول الموقع</p>
            <p className="text-white/50 text-xs mt-0.5">AKZ & AL-KHWARIZMI · Solar Energy Solutions</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition text-xl font-bold">×</button>
        </div>
        <div className="p-6 space-y-6" dir="rtl" style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>

          <section className="space-y-3">
            <h3 className="font-black text-base" style={{ color: NAVY }}>🏢 عن شركة الخوارزمي للطاقة الشمسية</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              تأسست شركة الخوارزمي AKZ Iraq Solar بهدف تقديم حلول متكاملة للطاقة الشمسية في العراق والمنطقة العربية.
              نؤمن بأن الطاقة المتجددة ليست رفاهية بل ضرورة حتمية لمستقبل مستدام، ونسعى إلى نشر ثقافة الاستثمار
              في الطاقة الشمسية من خلال الأدوات الهندسية الاحترافية والتصاميم الدقيقة.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-black text-base" style={{ color: NAVY }}>🎯 الغرض من هذا الموقع</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              صُمِّم هذا الموقع ليكون أداة مرجعية هندسية يستخدمها المهندسون والتقنيون وأصحاب المشاريع لـ:
            </p>
            <ul className="space-y-2">
              {[
                "تصميم منظومات الطاقة الشمسية بدقة هندسية معتمدة على المعادلات الكهربائية الصحيحة",
                "تقدير التكاليف الإجمالية وحساب العائد على الاستثمار وفترة الاسترداد",
                "توليد تقارير PDF احترافية جاهزة للعرض على العملاء والمستثمرين",
                "تصميم أوتار MPPT بشكل تلقائي مع التحقق من مواصفات الإنفرتر",
                "دعم ثلاثة قطاعات رئيسية: السكني والتجاري والزراعي",
              ].map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600">
                  <span className="text-amber-500 font-black shrink-0">◆</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl overflow-hidden" style={{ border: "1px solid #e2e8f0" }}>
            <div className="px-4 py-3" style={{ background: NAVY }}>
              <h3 className="font-black text-sm text-white">☀️ مستقبل الطاقة الشمسية في الشرق الأوسط</h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-600 leading-relaxed">
                يمتلك الشرق الأوسط وشمال أفريقيا أعلى معدلات الإشعاع الشمسي في العالم، مما يجعله من أكثر المناطق
                ملاءمةً لتطوير الطاقة الشمسية. العراق تحديداً يتمتع بمعدل إشعاع شمسي يتراوح بين
                <strong> 5 إلى 6.5 ساعة ذروة يومياً</strong>، وهو من أعلى المعدلات عالمياً.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["2030", "من المتوقع أن تتجاوز الطاقة الشمسية المركبة في المنطقة 500 GW"],
                  ["التوفير", "تخفيض فاتورة الكهرباء والديزل بنسبة 60-80% في أغلب التطبيقات"],
                  ["الزراعة", "الطاقة الشمسية لضخ المياه تُحدث ثورة في القطاع الزراعي العراقي"],
                  ["التوظيف", "يُتوقع خلق أكثر من 200,000 فرصة عمل في قطاع الطاقة المتجددة بالمنطقة"],
                ].map(([title, desc]) => (
                  <div key={title as string} className="rounded-xl p-3" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <p className="text-xs font-black mb-1" style={{ color: AMBER }}>{title}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-black text-base" style={{ color: NAVY }}>💡 توصيات للمستثمرين في الطاقة الشمسية</h3>
            <div className="space-y-2">
              {[
                ["ابدأ بدراسة الحمل الكهربائي بدقة", "قياس الاستهلاك الفعلي لمدة أسبوع قبل التصميم يعطي نتائج أكثر دقة من التقدير"],
                ["اختر بطاريات LiFePO4", "رغم ارتفاع سعرها مقارنةً بالرصاص الحامض، إلا أن عمرها الأطول (10+ سنوات) يجعلها الأوفر على المدى البعيد"],
                ["لا تختصر في حجم الإنفرتر", "اختر إنفرتراً بقدرة 150% من حمل النظام لتحمّل الانطلاق والحرارة"],
                ["استثمر في الصيانة الدورية", "تنظيف الألواح كل 3 أشهر يحافظ على كفاءة تتجاوز 95% في المناطق الغبارية"],
                ["اطلع على التشريعات المحلية", "تحقق من قوانين تصدير الكهرباء للشبكة في منطقتك قبل تصميم المنظومة"],
              ].map(([title, desc]) => (
                <div key={title as string} className="flex gap-3 rounded-xl p-3" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <span className="text-green-500 font-black text-sm shrink-0 mt-0.5">✓</span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl p-4 text-center" style={{ background: NAVY }}>
            <p className="text-white font-black text-sm">Designed by Eng. Riyadh Noori</p>
            <p className="text-amber-400 text-xs mt-1">AKZ & AL-KHWARIZMI · Baghdad, Iraq</p>
            <p className="text-white/30 text-[10px] mt-2">SolarDesigner v1.2 · © 2025 جميع الحقوق محفوظة</p>
          </section>

        </div>
        <div className="px-6 pb-6">
          <button onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition hover:opacity-90"
            style={{ background: NAVY }}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SolarDesigner() {
  const [tab, setTab] = useState<Tab>("residential");
  const [forms, setForms] = useState<Record<Tab, Form>>({
    residential: initForm(), commercial: initForm(), agricultural: initForm(),
  });
  const [showProInputs, setShowProInputs] = useState(false);
  const [showReadMe, setShowReadMe] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

  const f = forms[tab];
  const isA = tab === "agricultural";

  const set = useCallback((k: keyof Form, v: number | string) =>
    setForms((p) => ({ ...p, [tab]: { ...p[tab], [k]: v } })), [tab]);
  const setInv = useCallback((k: keyof InverterSpecs, v: number) =>
    setForms((p) => ({ ...p, [tab]: { ...p[tab], invSpecs: { ...p[tab].invSpecs, [k]: v } } })), [tab]);
  const setPnl = useCallback((k: keyof PanelSpecs, v: number) =>
    setForms((p) => ({ ...p, [tab]: { ...p[tab], pnlSpecs: { ...p[tab].pnlSpecs, [k]: v } } })), [tab]);

  const r = run(f, tab);
  const mppt = useMemo(() => calcMppt(f, r.panels), [f, r.panels]);
  const pct = (v: number) => (r.total > 0 ? (v / r.total) * 100 : 0);
  const activeTab = TABS.find((t) => t.id === tab)!;
  const handleExportPDF = () => exportPDF(f, r, mppt, tab).catch(console.error);

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f8", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Modals */}
      {showReadMe && <ReadMeModal onClose={() => setShowReadMe(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      <Dialog open={showAssistant} onOpenChange={setShowAssistant}>
        <DialogContent className="w-screen max-w-5xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>🤖 مساعد التركيب الذكي</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <InstallationAssistant />
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="relative overflow-hidden pt-12 pb-0"
        style={{ background: `linear-gradient(160deg, #003366 0%, #001122 100%)` }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(#fbbf24 0.6px, transparent 0)", backgroundSize: "24px 24px" }} />
        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="relative">
              <div className="relative w-28 h-28 bg-white rounded-[2rem] p-1 flex items-center justify-center border border-white/10">
                <img src={akzLogo} alt="AKZ Logo" className="w-full h-full object-cover rounded-xl" />
              </div>
            </div>
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-white font-black text-4xl md:text-5xl tracking-tight leading-none">
                AKZ <span style={{ color: AMBER }}>Iraq</span> Solar
              </h1>
              <h2 className="text-xl md:text-2xl font-semibold text-slate-300 mt-1.5">الخوارزمي للطاقة الشمسية</h2>
              <div className="mt-5 flex flex-wrap justify-center md:justify-start gap-3">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10"
                  style={{ background: "rgba(255,255,255,0.05)" }}>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                  <span className="text-slate-200 text-xs font-bold uppercase tracking-wider">Solar PV Systems Specialist</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-12 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-6 py-4 text-sm font-black rounded-t-2xl transition-all duration-300 whitespace-nowrap outline-none border-b-4"
                style={tab === t.id
                  ? { background: "#ffffff", color: NAVY, borderColor: AMBER, transform: "translateY(-3px)", boxShadow: "0 -8px 20px rgba(0,0,0,0.15)" }
                  : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", borderColor: "transparent" }
                }>
                <span>{t.icon}</span><span>{t.en}</span>
                <span className="text-xs font-medium opacity-60">| {t.ar}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Sub-strip */}
      <div className="bg-white border-b border-slate-200 shadow-sm relative z-20">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Active System</span>
            <div className="h-3.5 w-px bg-slate-200" />
            <span className="text-xs font-bold uppercase" style={{ color: AMBER }}>{activeTab.en}</span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">— {activeTab.spec}</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowProInputs((v) => !v)}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all"
              style={showProInputs ? { background: NAVY, color: "#fff", borderColor: NAVY } : { background: "#fff", color: "#94a3b8", borderColor: "#e2e8f0" }}>
              {showProInputs ? "⚙ Pro ON" : "⚙ Pro Mode"}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowReadMe(true)}
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all"
                style={{ background: "#fff", color: "#64748b", borderColor: "#e2e8f0" }}>
                📖 اقرأني
              </button>
              <button type="button" onClick={() => setShowAbout(true)}
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all"
                style={{ background: "#fff", color: "#64748b", borderColor: "#e2e8f0" }}>
                🌍 حول الموقع
              </button>
              <button type="button" onClick={() => setShowAssistant(true)}
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all"
                style={{ background: "#fff", color: "#64748b", borderColor: "#e2e8f0" }}>
                🤖 مساعد التركيب
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-5 py-7 space-y-5">

        <DiagramPlaceholder tab={tab} />

        {/* System Inputs */}
        <Card title="System Inputs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><FieldLabel text="Panel Brand" /><SelInput value={f.panelBrand} onChange={(v) => set("panelBrand", v)} opts={PANEL_BRANDS} tipKey="Panel Brand" /></div>
            <div><FieldLabel text="Panel Wattage" hint="Default: 620W" /><NumInput value={f.panelWattage} onChange={(v) => set("panelWattage", v)} min={100} step={10} unit="W" tipKey="Panel Wattage" /></div>
            <div>
              <FieldLabel text={isA ? "3-Phase Load (Amps)" : "Day Load (Amps)"}
                hint={isA ? "A × 400V × 1.732 × 0.85 PF ÷ 1000" : "A × 230V × 0.85 PF ÷ 1000"} />
              <NumInput value={f.dayAmps} onChange={(v) => set("dayAmps", v)} min={0} step={1} unit="A" tipKey={isA ? "3-Phase Load (Amps)" : "Day Load (Amps)"} />
            </div>
            {!isA && (<>
              <div><FieldLabel text="Night Load (Amps)" hint="Used for battery bank sizing" /><NumInput value={f.nightAmps} onChange={(v) => set("nightAmps", v)} min={0} step={1} unit="A" tipKey="Night Load (Amps)" /></div>
              <div><FieldLabel text="Desired Night Backup (Hours)" hint="Autonomy hours — default 3h" /><NumInput value={f.backupHours} onChange={(v) => set("backupHours", v)} min={0.5} step={0.5} unit="h" tipKey="Desired Night Backup (Hours)" /></div>
            </>)}
          </div>
        </Card>

        {/* Pro Mode Inputs */}
        {showProInputs && (
          <Card title="⚙ Pro Mode — Panel & Inverter Electrical Specs" badge="MPPT Auto-Design">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Panel Datasheet</p>
                {([["Voc (Open Circuit Voltage)", "voc", "V"], ["Vmp (Max Power Voltage)", "vmp", "V"],
                   ["Imp (Max Power Current)", "imp", "A"], ["Isc (Short Circuit Current)", "isc", "A"]] as [string, keyof PanelSpecs, string][])
                  .map(([label, key, unit]) => (
                    <div key={key}><FieldLabel text={label} /><NumInput value={f.pnlSpecs[key]} onChange={(v) => setPnl(key, v)} min={0} step={0.1} unit={unit} tipKey={label} /></div>
                  ))}
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Inverter MPPT Specs</p>
                {([["Max PV Voltage", "maxPvVolts", "V"], ["MPPT Min Voltage", "minMpptVolts", "V"],
                   ["MPPT Max Voltage", "maxMpptVolts", "V"], ["Max MPPT Current", "maxMpptCurrent", "A"],
                   ["Number of MPPTs", "mpptCount", ""]] as [string, keyof InverterSpecs, string][])
                  .map(([label, key, unit]) => (
                    <div key={key}><FieldLabel text={label} /><NumInput value={f.invSpecs[key]} onChange={(v) => setInv(key, v)} min={0} step={key === "mpptCount" ? 1 : 10} unit={unit} tipKey={label} /></div>
                  ))}
              </div>
            </div>
          </Card>
        )}

        {/* Efficiency */}
        <Card title="Efficiency Parameters" badge="Default: 80% each">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Slider label="Panel (effP)" value={f.effP} onChange={(v) => set("effP", v)} />
            <Slider label="Inverter (effI)" value={f.effI} onChange={(v) => set("effI", v)} />
            {!isA && <Slider label="Battery (effB)" value={f.effB} onChange={(v) => set("effB", v)} />}
          </div>
        </Card>

        {/* Technical Results */}
        <Card title="Technical Results">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatBox primary label="System Capacity" value={r.cap.toFixed(2) + " kW"}
              sub={isA ? "A × 400V × 1.732 × 0.85 PF ÷ 1000" : "A × 230V × 0.85 PF ÷ 1000"} />
            <StatBox label="Total Panels" value={String(r.panels)} sub={f.panelBrand + " · " + f.panelWattage + "W"} />
            <StatBox label="Daily Energy" value={(r.dailyWh / 1000).toFixed(1) + " kWh"} sub={"Based on " + PSH + "h peak sun (Baghdad)"} />
            <StatBox label="String Config" value={r.strings > 0 ? r.strings + " × " + r.pps : "—"} sub="Target: 10–14 panels/string" />
            {!isA && <StatBox label={"Battery Bank (" + f.backupHours + "h)"} value={String(r.batt)} sub={"× 5.12kWh LiFePO4 · DoD 80% · usable 4.1kWh each"} />}
            <StatBox label="Inverter (1.5×)" value={r.inv + " kW"} sub={"Min " + (r.cap * SRG).toFixed(2) + " kW · surge + heat"} />
          </div>
          <div className="mt-3 rounded-xl border border-blue-100 px-4 py-3" style={{ background: "#eff6ff" }}>
            <p className="text-[10px] font-extrabold uppercase tracking-widest mb-0.5" style={{ color: NAVY, opacity: 0.5 }}>Controller Recommendation</p>
            <p className="text-sm font-bold" style={{ color: NAVY }}>{r.ctrl}</p>
          </div>
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Standard Inverter Sizes</p>
            <div className="flex flex-wrap gap-2">
              {INVERTER_SIZES.map((s) => (
                <span key={s} className="text-xs font-bold px-3 py-1 rounded-full border transition-all"
                  style={s === r.inv ? { background: NAVY, color: "#fff", border: `1px solid ${NAVY}` } : { background: "#fff", color: "#94a3b8", border: "1px solid #e2e8f0" }}>
                  {s} kW{s === r.inv ? " ✓" : ""}
                </span>
              ))}
            </div>
          </div>
        </Card>

        {/* MPPT (Pro only) */}
        {showProInputs && (
          <Card title="MPPT Auto-Design Engine" badge="Pro Feature">
            <MpptPanel mppt={mppt} mpptCount={f.invSpecs.mpptCount} />
          </Card>
        )}

        {/* Cost Breakdown */}
        <Card title="Cost Breakdown" badge="4 fields required">
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div><FieldLabel text="Panels Cost ($)" /><NumInput value={f.costPanels} onChange={(v) => set("costPanels", v)} min={0} step={100} unit="$" tipKey="Panels Cost ($)" /></div>
              {!isA && <div><FieldLabel text="Batteries Cost ($)" /><NumInput value={f.costBatteries} onChange={(v) => set("costBatteries", v)} min={0} step={100} unit="$" tipKey="Batteries Cost ($)" /></div>}
              <div><FieldLabel text="Inverter Cost ($)" /><NumInput value={f.costInverter} onChange={(v) => set("costInverter", v)} min={0} step={100} unit="$" tipKey="Inverter Cost ($)" /></div>
              <div><FieldLabel text="Installation & Transport ($)" /><NumInput value={f.costInstall} onChange={(v) => set("costInstall", v)} min={0} step={50} unit="$" tipKey="Installation & Transport ($)" /></div>
            </div>
            {r.total > 0 && (
              <div className="space-y-3 pt-1">
                <CostBar label="Panels" amount={f.costPanels} pct={pct(f.costPanels)} />
                {!isA && <CostBar label="Batteries" amount={f.costBatteries} pct={pct(f.costBatteries)} />}
                <CostBar label="Inverter" amount={f.costInverter} pct={pct(f.costInverter)} />
                <CostBar label="Installation" amount={f.costInstall} pct={pct(f.costInstall)} />
                <div className="flex items-center justify-between rounded-xl px-5 py-4 mt-2" style={{ background: NAVY }}>
                  <p className="text-sm font-bold text-white/60">Total System Cost</p>
                  <p className="text-2xl font-extrabold text-white">${r.total.toLocaleString("en-US")}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Financial + PDF */}
        <Card title="Financial Analysis & PDF Report">
          <div className="space-y-5">
            <div>
              <FieldLabel text="Expected Monthly Savings (USD)" hint="Estimated electricity bill reduction per month" />
              <NumInput value={f.savings} onChange={(v) => set("savings", v)} min={0} step={10} unit="$" tipKey="Expected Monthly Savings (USD)" />
            </div>
            {r.annual > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {[{ l: "Annual Savings", v: "$" + r.annual.toLocaleString("en-US") },
                  { l: "Payback Period", v: r.payback.toFixed(1) + " yrs" },
                  { l: "Annual ROI", v: r.roi.toFixed(1) + "%" }].map(({ l, v }) => (
                  <div key={l} className="border border-slate-200 rounded-xl p-3 text-center bg-slate-50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{l}</p>
                    <p className="text-lg font-extrabold" style={{ color: NAVY }}>{v}</p>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={handleExportPDF}
              className="w-full py-4 rounded-xl text-sm font-extrabold tracking-wide transition-all flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99]"
              style={{ background: NAVY, color: "#fff", cursor: "pointer" }}>
              ↓ &nbsp; Download Technical Proposal PDF
            </button>
          </div>
        </Card>

        {/* Formulas */}
        <Card title={"Engineering Formulas — " + activeTab.en}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(isA ? [
              ["System Capacity (kW)", "(Amps × 400V × 1.732 × 0.85 PF) / 1000"],
              ["Total Panels", "(Capacity × 1000) / (Wattage × effP × effI)"],
              ["Inverter Size", "Next std size ≥ Capacity × 1.5 (surge + heat)"],
              ["String Target", "10–14 panels per string"],
            ] : [
              ["System Capacity (kW)", "(Day Amps × 230V × 0.85 PF) / 1000"],
              ["Total Panels", "(Capacity × 1000) / (Wattage × effP × effI)"],
              ["Battery Units", "(Night A × 230V × Hours) / (5,120Wh × 0.8 DoD)"],
              ["Inverter Size", "Next std size ≥ Capacity × 1.5 (surge + heat)"],
            ]).map(([lbl, formula]) => (
              <div key={lbl}>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 mb-1">{lbl}</p>
                <p className="font-mono text-xs rounded-lg px-3 py-2 border border-slate-200 text-slate-600 leading-relaxed"
                  style={{ background: "#f8fafc" }}>{formula}</p>
              </div>
            ))}
          </div>
        </Card>

      </main>

      <footer className="py-6 text-center mt-4" style={{ background: NAVY }}>
        <p className="text-white font-extrabold text-sm tracking-wide">Iraq Sun Power · AKZ Solar</p>
        <p className="font-semibold text-sm mt-0.5" style={{ color: AMBER }}>الخوارزمي للطاقة الشمسية</p>
        <p className="text-white/30 text-xs mt-2">Approved by Eng. Riyadh Nouri · Baghdad, Iraq</p>
      </footer>

    </div>
  );
}
