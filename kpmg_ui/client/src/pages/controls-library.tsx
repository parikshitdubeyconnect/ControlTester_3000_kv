import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useCrossNav } from "@/contexts/CrossNavContext";
import { useLibraryMetrics } from "@/contexts/LibraryMetricsContext";
import Footer from "@/components/Footer";
import {
  Upload, X, Play, RotateCcw, Search, Trash2, ShieldCheck,
  LayoutDashboard, List, ChevronDown, ChevronRight, BookOpen,
  FileText, Link2, Layers,
  Activity, Download,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, Cell, Legend,
  PieChart, Pie,
} from "recharts";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE } from "@/lib/chartTheme";

// ── Colors ───────────────────────────────────────────────────────────────────

const HUES = [220, 160, 30, 280, 10, 190, 120, 50, 340, 260, 90, 200];

const CONTROL_TYPE_COLOR: Record<string, string> = {
  preventive:   "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300",
  detective:    "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  corrective:   "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300",
  directive:    "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300",
  compensating: "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
};

const ENFORCEMENT_COLOR: Record<string, string> = {
  mandatory:   "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
  recommended: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  optional:    "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
};

function domainHue(domain: string, allDomains: string[]): number {
  const idx = allDomains.indexOf(domain);
  return HUES[idx % HUES.length];
}

// ── TypeScript interfaces ─────────────────────────────────────────────────────

interface MappedObligation {
  obligation_id: string;
  obligation_text: string;
  section_reference: string;
  framework_name: string;
  enforcement_level: string;
  match_score: number;
}

interface ExtractedControl {
  control_id: string;
  control_name: string;
  description: string;
  document_reference: string;
  domain: string;
  control_type: string;
  keywords: string[];
  specificity_level: string;
  mapped_obligations: MappedObligation[];
  _source_filename?: string;
}

interface MergedControl extends ExtractedControl {
  merged_from_count: number;
  source_documents: { filename: string; document_reference: string; is_primary: boolean }[];
}

interface ControlsDocument {
  document_id: string;
  source_filename: string;
  upload_timestamp: string;
  model_used?: string;
  total_controls: number;
  controls_by_domain?: Record<string, number>;
}

interface ControlsDocumentFull extends ControlsDocument {
  controls: ExtractedControl[];
}

type RightPanelView = "dashboard" | "controls";
type ControlsViewMode = "document" | "merged";

// ── 5W1H Quality Analysis ─────────────────────────────────────────────────────

interface W1HResult { who: boolean; what: boolean; where: boolean; how: boolean; when: boolean; why: boolean; }
interface CtrlW1H extends ExtractedControl { w1h: W1HResult; score: number; rag: "green" | "amber" | "red"; }


function ragFromScore(score: number): "green" | "amber" | "red" {
  return score >= 5 ? "green" : score === 4 ? "amber" : "red";
}

// Keyword-driven 5W1H heuristic. Used as a fallback when the FastAPI
// /quality-analysis endpoint is unreachable (e.g. static Vercel deploy) or
// returns no results — so the tab always populates something meaningful.
const W1H_PATTERNS: Record<keyof W1HResult, RegExp> = {
  who: /\b(manager|analyst|team|committee|officer|owner|department|function|unit|head of|chief|director|administrator|staff|personnel|reviewer|approver|custodian|operator|senior|lead|board|treasurer|controller)\b/i,
  what: /\b(review(s|ed|ing)?|verif(y|ies|ied)|validat(e|es|ed|ion)|approv(e|es|ed|al)|perform(s|ed)?|ensure(s|d)?|check(s|ed|ing)?|monitor(s|ed|ing)?|reconcil(e|es|ed|iation)|process(es|ed)?|assess(es|ed|ment)?|test(s|ed|ing)?|complet(e|ed)|execut(e|ed)|investigat(e|ed)|authoris(e|ed)|authoriz(e|ed))\b/i,
  where: /\b(system|platform|module|application|register|database|environment|portal|dashboard|tool|ledger|workflow|sharepoint|repository|server|cloud|network|ERP|GRC|within the|in the)\b/i,
  how: /\b(by |through |via |using |in accordance with|per the|following the|based on|against the|pursuant to|procedure|methodology|process|framework|standard|policy|protocol|control matrix|checklist|workflow)\b/i,
  when: /\b(daily|weekly|monthly|quarterly|annually|yearly|bi-annually|semi-annually|every|each|prior to|after the|upon|before|following|within \d+|at least (once|twice)|on (a )?(daily|weekly|monthly|quarterly|annual) basis|real[- ]time|continuously|as required|ad hoc|scheduled)\b/i,
  why: /\b(to ensure|to prevent|to mitigate|to verify|to detect|to maintain|to comply|for compliance|in order to|so that|to protect|to support|to reduce|to manage|to safeguard|to address|purpose of)\b/i,
};

function analyzeW1HClientSide(text: string): W1HResult {
  const t = (text || "").replace(/\s+/g, " ");
  const r = {} as W1HResult;
  for (const k of W1H_KEYS) r[k] = W1H_PATTERNS[k].test(t);
  return r;
}

function scoreFromW1H(w: W1HResult): number {
  return W1H_KEYS.reduce((n, k) => n + (w[k] ? 1 : 0), 0);
}

function exportQualityCSV(controls: CtrlW1H[]) {
  const header = ["Control ID","Control Name","Process Area","WHO","WHAT","WHERE","HOW","WHEN","WHY","Score","RAG"];
  const rows = controls.map(c => [
    c.control_id, c.control_name, c.domain,
    c.w1h.who?"Y":"N", c.w1h.what?"Y":"N", c.w1h.where?"Y":"N",
    c.w1h.how?"Y":"N", c.w1h.when?"Y":"N", c.w1h.why?"Y":"N",
    String(c.score), c.rag.toUpperCase()
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
  const a = Object.assign(document.createElement("a"), {href: url, download: "controls_quality.csv"});
  a.click(); URL.revokeObjectURL(url);
}

const RAG_COLOR = { green: "#009A44", amber: "#EAAA00", red: "#D73027" };
const RAG_BG: Record<"green"|"amber"|"red", string> = {
  green: "bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300",
  amber: "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  red:   "bg-red-50 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
};
const W1H_KEYS: (keyof W1HResult)[] = ["who", "what", "where", "how", "when", "why"];
const W1H_COLORS: Record<keyof W1HResult, string> = {
  who: "#1E49E2", what: "#F97316", where: "#8B5CF6",
  how: "#EC4899", when: "#10B981", why: "#0EA5E9",
};

// ── Coverage Ring ────────────────────────────────────────────────────────────

function CoverageRing({ pct, size = 28 }: { pct: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 75 ? "var(--green)" : pct >= 40 ? "var(--amber)" : "var(--red)";
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={2} className="text-muted/40" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={2.5}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-500"
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        className="fill-foreground" style={{ fontSize: size * 0.3, fontFamily: "var(--font-mono)" }}>
        {pct}
      </text>
    </svg>
  );
}

// ── Obligation Radar Chart ──────────────────────────────────────────────────

function ObligationRadar({ obligations }: { obligations: MappedObligation[] }) {
  const [viewMode, setViewMode] = useState<"framework" | "domain">("framework");

  // Group by framework
  const byFramework: Record<string, { count: number; avgScore: number }> = {};
  for (const obl of obligations) {
    const key = obl.framework_name || "Unknown";
    if (!byFramework[key]) byFramework[key] = { count: 0, avgScore: 0 };
    byFramework[key].count++;
    byFramework[key].avgScore += obl.match_score;
  }
  for (const k of Object.keys(byFramework)) {
    byFramework[k].avgScore = Math.round((byFramework[k].avgScore / byFramework[k].count) * 100);
  }

  // Group by enforcement level as a proxy for "domain" dimension
  const byEnforcement: Record<string, { count: number; avgScore: number }> = {};
  for (const obl of obligations) {
    const key = obl.enforcement_level || "unknown";
    if (!byEnforcement[key]) byEnforcement[key] = { count: 0, avgScore: 0 };
    byEnforcement[key].count++;
    byEnforcement[key].avgScore += obl.match_score;
  }
  for (const k of Object.keys(byEnforcement)) {
    byEnforcement[k].avgScore = Math.round((byEnforcement[k].avgScore / byEnforcement[k].count) * 100);
  }

  const activeData = viewMode === "framework" ? byFramework : byEnforcement;
  const radarData = Object.entries(activeData).map(([name, { count, avgScore }]) => ({
    axis: name.length > 16 ? name.slice(0, 14) + "…" : name,
    fullName: name,
    count,
    score: avgScore,
  }));

  if (radarData.length < 3) {
    // Need at least 3 points for a meaningful radar
    return null;
  }

  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Obligation Coverage
        </span>
        <div className="flex gap-1">
          {(["framework", "domain"] as const).map(mode => (
            <button
              key={mode}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize ${
                viewMode === mode
                  ? "bg-[var(--pacific)]/15 border-[var(--pacific)]/30 text-[var(--pacific)]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode(mode)}
            >
              {mode === "domain" ? "Enforcement" : mode}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="var(--grid-color)" strokeWidth={0.5} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fill: "#8492A6" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 8, fill: "#8492A6" }}
            axisLine={false}
          />
          <Radar
            name="Match Score"
            dataKey="score"
            stroke="#00B8F5"
            fill="#00B8F5"
            fillOpacity={0.2}
            strokeWidth={1.5}
          />
          <Radar
            name="Count"
            dataKey="count"
            stroke="#7213EA"
            fill="#7213EA"
            fillOpacity={0.1}
            strokeWidth={1}
            strokeDasharray="4 2"
          />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Control Card ─────────────────────────────────────────────────────────────

function ControlCard({
  ctrl,
  allDomains,
  isMerged = false,
  onObligationClick,
}: {
  ctrl: ExtractedControl | MergedControl;
  allDomains: string[];
  isMerged?: boolean;
  onObligationClick?: (obligationId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [oblExpanded, setOblExpanded] = useState(false);
  const hue = domainHue(ctrl.domain, allDomains);
  const mergedCtrl = ctrl as MergedControl;

  return (
    <div className="border rounded-lg overflow-hidden transition-all duration-200 hover:border-primary/40">
      {/* Header bar */}
      <div
        className="flex items-start gap-2 p-3 cursor-pointer"
        style={{ borderLeft: `3px solid hsl(${hue},70%,50%)` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <code className="text-[10px] font-mono font-bold text-[#0C233C] bg-[#F0F2F7] border border-[#E2E6EF] rounded px-1.5 py-0.5">{ctrl.control_id}</code>
            <Badge
              variant="outline"
              className={`text-[10px] ${CONTROL_TYPE_COLOR[ctrl.control_type] ?? ""}`}
            >
              {ctrl.control_type}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] font-semibold"
              style={{ borderColor: `hsl(${hue},55%,55%)`, color: `hsl(${hue},65%,28%)`, background: `hsl(${hue},55%,96%)` }}
            >
              {ctrl.domain.replace(/_/g, " ")}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] text-[#5A6478] border-[#CBD2DD]"
            >
              {ctrl.specificity_level}
            </Badge>
            {isMerged && mergedCtrl.merged_from_count > 1 && (
              <Badge variant="secondary" className="text-[10px]">
                <Layers className="h-2.5 w-2.5 mr-0.5" />
                {mergedCtrl.merged_from_count} sources
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold leading-tight text-[#0C233C]">{ctrl.control_name}</p>
          <p className={`text-xs text-[#5A6478] mt-1 ${expanded ? "" : "line-clamp-2"}`}>
            {ctrl.description}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0 mt-1">
          {ctrl.mapped_obligations?.length > 0 && (
            <CoverageRing pct={Math.round(
              (ctrl.mapped_obligations.reduce((s, o) => s + o.match_score, 0) / ctrl.mapped_obligations.length) * 100
            )} />
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t bg-muted/20 px-3 pb-3 space-y-3 pt-2.5">

          {/* Radar chart for obligation mapping */}
          {ctrl.mapped_obligations?.length >= 3 && (
            <ObligationRadar obligations={ctrl.mapped_obligations} />
          )}

          {/* Document reference */}
          {ctrl.document_reference && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="font-medium">Ref:</span>
              <span>{ctrl.document_reference}</span>
            </div>
          )}

          {/* Keywords */}
          {ctrl.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ctrl.keywords.map((kw, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded-full border"
                  style={{
                    background: `hsl(${hue},60%,95%)`,
                    borderColor: `hsl(${hue},60%,80%)`,
                    color: `hsl(${hue},60%,35%)`,
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* Merged sources */}
          {isMerged && mergedCtrl.source_documents?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {mergedCtrl.source_documents.map((src, i) => (
                  <Badge
                    key={i}
                    variant={src.is_primary ? "default" : "outline"}
                    className="text-[10px] max-w-[180px] truncate"
                    title={src.filename + (src.document_reference ? ` — ${src.document_reference}` : "")}
                  >
                    {src.is_primary && <span className="mr-1">★</span>}
                    {src.filename}
                    {src.document_reference && <span className="opacity-70 ml-1">§{src.document_reference}</span>}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Mapped obligations */}
          <div>
            <button
              className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-full hover:text-foreground transition-colors"
              onClick={() => setOblExpanded(!oblExpanded)}
            >
              <Link2 className="h-3 w-3" />
              Regulatory Obligations
              {ctrl.mapped_obligations?.length > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-1">{ctrl.mapped_obligations.length}</Badge>
              )}
              <ChevronRight className={`h-3 w-3 ml-auto transition-transform ${oblExpanded ? "rotate-90" : ""}`} />
            </button>

            {oblExpanded && (
              <div className="mt-2 space-y-1.5">
                {!ctrl.mapped_obligations?.length ? (
                  <p className="text-xs text-muted-foreground italic">No matching obligations found</p>
                ) : (
                  ctrl.mapped_obligations.map((obl, i) => (
                    <div
                      key={i}
                      className="rounded border bg-background px-2.5 py-2 space-y-1"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          title="Navigate to this obligation in Regulatory Library"
                          className="text-[10px] font-mono text-[var(--pacific)] bg-[var(--pacific)]/10 hover:bg-[var(--pacific)]/20 border border-[var(--pacific)]/30 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                          onClick={() => onObligationClick?.(obl.obligation_id)}
                        >
                          ↗ {obl.obligation_id}
                        </button>
                        <span className="text-[10px] font-medium text-foreground">{obl.framework_name}</span>
                        {obl.section_reference && (
                          <span className="text-[10px] text-muted-foreground">§{obl.section_reference}</span>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[10px] ml-auto ${ENFORCEMENT_COLOR[obl.enforcement_level] ?? ""}`}
                        >
                          {obl.enforcement_level}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {Math.round(obl.match_score * 100)}% match
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{obl.obligation_text}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ControlsLibraryPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { pendingControlId, setPendingControlId, setPendingObligationId, pendingQualityAnalysis, setPendingQualityAnalysis } = useCrossNav();
  const { refreshMetrics } = useLibraryMetrics();

  // Upload section collapse
  const [uploadSectionOpen, setUploadSectionOpen] = useState(true);

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<any[]>([]);

  // Document list
  const [controlsDocs, setControlsDocs] = useState<ControlsDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Selected document (full with controls)
  const [selectedDoc, setSelectedDoc] = useState<ControlsDocumentFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [docCache, setDocCache] = useState<Record<string, ControlsDocumentFull>>({});

  // Merged controls
  const [mergedControls, setMergedControls] = useState<MergedControl[] | null>(null);
  const [mergedLoading, setMergedLoading] = useState(false);

  // Right panel & controls view
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("dashboard");
  const [controlsViewMode, setControlsViewMode] = useState<ControlsViewMode>("document");

  // Controls-view filters
  const [domainFilter, setDomainFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Dashboard state
  const [dashboardControls, setDashboardControls] = useState<(ExtractedControl & { _source_filename?: string })[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardDomainFilter, setDashboardDomainFilter] = useState("all");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [dashboardTab, setDashboardTab] = useState<"overview" | "quality">("overview");
  const [qualityRagFilter, setQualityRagFilter] = useState<"all" | "green" | "amber" | "red">("all");
  const [selectedQualityControl, setSelectedQualityControl] = useState<CtrlW1H | null>(null);
  const [qualitySearch, setQualitySearch] = useState("");
  const [ctrlsW1H, setCtrlsW1H] = useState<CtrlW1H[]>([]);

  // Clear library state
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [remapping, setRemapping] = useState(false);

  // Merged stats for quality tab KPIs (fetched quietly, no view switch)
  const [mergedCtrlStats, setMergedCtrlStats] = useState<{ total_raw: number; total_merged: number } | null>(null);
  const [mergedStatsLoading, setMergedStatsLoading] = useState(false);

  useEffect(() => { fetchDocs(); }, []);

  // React to cross-page navigation: jump to a specific control
  useEffect(() => {
    if (!pendingControlId) return;
    setRightPanelView("dashboard");
    setControlsViewMode("document");
    setDashboardSearch(pendingControlId);
    setPendingControlId(null);
  }, [pendingControlId]);

  // React to cross-page navigation: open quality analysis tab
  useEffect(() => {
    if (!pendingQualityAnalysis) return;
    setRightPanelView("dashboard");
    setDashboardTab("quality");
    setPendingQualityAnalysis(false);
  }, [pendingQualityAnalysis]);

  // Auto-fetch merged stats and quality analysis when quality tab is active
  useEffect(() => {
    if (dashboardTab === "quality" && dashboardControls.length > 0) {
      if (mergedCtrlStats === null && !mergedStatsLoading) fetchMergedStats();
      if (ctrlsW1H.length === 0) {
        fetchQualityAnalysis(
          dashboardControls.map(c => ({
            control_id: c.control_id ?? String((c as any).id ?? ""),
            name: (c as any).control_name ?? c.control_id ?? "",
            description: c.description ?? "",
          })),
          dashboardControls,
        );
      }
    }
  }, [dashboardTab, dashboardControls.length]);

  // Navigate to regulatory library focused on a specific obligation
  const handleObligationClick = (obligationId: string) => {
    setPendingObligationId(obligationId);
    setLocation("/regulatory-library");
  };

  // ── API helpers ─────────────────────────────────────────────────────────────

  const fetchDocs = async () => {
    setDocsLoading(true);
    try {
      const res = await fetch("/api/controls-library/documents");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.documents)) {
        setControlsDocs(data.documents);
      }
    } catch (err) {
      console.warn("fetchDocs failed:", err);
    } finally {
      setDocsLoading(false);
    }
    // Also refresh dashboard controls
    fetchAllControls();
  };

  const fetchAllControls = async (): Promise<ExtractedControl[]> => {
    setDashboardLoading(true);
    try {
      const res = await fetch("/api/controls-library/all-controls");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.controls)) {
        setDashboardControls(data.controls);
        return data.controls as ExtractedControl[];
      }
      return [];
    } catch (err) {
      console.warn("fetchAllControls failed:", err);
      return [];
    } finally {
      setDashboardLoading(false);
    }
  };

  const fetchQualityAnalysis = useCallback(async (
    controls: { control_id: string; name: string; description: string }[],
    allControls: ExtractedControl[] = [],
  ) => {
    if (controls.length === 0) return;

    const ctrlMap = new Map(allControls.map(c => [c.control_id, c]));

    const buildFromHeuristic = (): CtrlW1H[] =>
      controls.map(c => {
        const ctrl = ctrlMap.get(c.control_id) ?? {} as any;
        const text = `${c.name || ""} ${c.description || ""}`.trim();
        const w1h = analyzeW1HClientSide(text);
        const score = scoreFromW1H(w1h);
        return {
          control_id: c.control_id,
          control_name: c.name || ctrl.control_name || c.control_id,
          description: c.description ?? ctrl.description ?? "",
          document_reference: ctrl.document_reference ?? "",
          domain: ctrl.domain ?? "",
          control_type: ctrl.control_type ?? "",
          keywords: ctrl.keywords ?? [],
          specificity_level: ctrl.specificity_level ?? "",
          mapped_obligations: ctrl.mapped_obligations ?? [],
          w1h,
          score,
          rag: ragFromScore(score),
        } as CtrlW1H;
      });

    try {
      const res = await fetch("/api/controls-library/quality-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controls }),
      });
      if (!res.ok) throw new Error(`Quality analysis HTTP ${res.status}`);
      const data = await res.json();
      const apiResults = Array.isArray(data.results) ? data.results : [];
      if (apiResults.length === 0) {
        // API reachable but returned nothing → fall back to client-side heuristic
        setCtrlsW1H(buildFromHeuristic());
        return;
      }
      const merged: CtrlW1H[] = apiResults.map((r: any) => {
        const ctrl = ctrlMap.get(r.control_id) ?? {} as any;
        const text = `${r.control_name || ctrl.control_name || ""} ${ctrl.description || ""}`.trim();
        // If the API skipped any 5W1H fields, fill them in client-side so
        // the analysis is never blank.
        const hasAny = ["who","what","where","how","when","why"].some(k => typeof r[k] === "boolean");
        const derived = hasAny ? null : analyzeW1HClientSide(text);
        const w1h: W1HResult = {
          who:   typeof r.who   === "boolean" ? r.who   : derived?.who   ?? false,
          what:  typeof r.what  === "boolean" ? r.what  : derived?.what  ?? false,
          where: typeof r.where === "boolean" ? r.where : derived?.where ?? false,
          how:   typeof r.how   === "boolean" ? r.how   : derived?.how   ?? false,
          when:  typeof r.when  === "boolean" ? r.when  : derived?.when  ?? false,
          why:   typeof r.why   === "boolean" ? r.why   : derived?.why   ?? false,
        };
        const score = typeof r.score === "number" ? r.score : scoreFromW1H(w1h);
        return {
          control_id: r.control_id,
          control_name: r.control_name ?? ctrl.control_name ?? r.control_id,
          description: ctrl.description ?? "",
          document_reference: ctrl.document_reference ?? "",
          domain: ctrl.domain ?? "",
          control_type: ctrl.control_type ?? "",
          keywords: ctrl.keywords ?? [],
          specificity_level: ctrl.specificity_level ?? "",
          mapped_obligations: ctrl.mapped_obligations ?? [],
          w1h,
          score,
          rag: r.rag ?? ragFromScore(score),
        } as CtrlW1H;
      });
      setCtrlsW1H(merged);
    } catch (err) {
      console.warn("Quality analysis API unavailable — running client-side heuristic:", err);
      setCtrlsW1H(buildFromHeuristic());
    }
  }, []);

  const handleIngest = async () => {
    if (uploadFiles.length === 0) return;
    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setIngesting(true);
    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      uploadFiles.forEach(f => formData.append("policy_files", f));
      const res = await fetch("/api/controls-library/ingest", { method: "POST", body: formData });
      const queued = await res.json();
      if (!res.ok) throw new Error(queued.detail?.error || "Ingest failed");

      // Poll background task until complete
      const taskId = queued.task_id;
      let data: any;
      while (true) {
        await new Promise(r => setTimeout(r, 3000));
        const poll = await fetch(`/api/ingest-task/${taskId}`);
        const task = await poll.json();
        if (task.status === "done") { data = task.result; break; }
        if (task.status === "failed") throw new Error(task.error || "Ingest failed");
      }

      const ingested: any[] = data.ingested || [];
      setIngestResults(ingested);
      setUploadFiles([]);
      await fetchDocs();
      const freshControls = await fetchAllControls();
      refreshMetrics();

      // Trigger backend 5W1H analysis using freshly-fetched controls (not stale closure)
      fetchQualityAnalysis(
        freshControls.map(c => ({
          control_id: c.control_id ?? String((c as any).id ?? ""),
          name: (c as any).control_name ?? c.control_id ?? "",
          description: c.description ?? "",
        })),
        freshControls,
      );

      const mongoFailed = ingested.some((r: any) => !r.mongo_saved);
      toast({
        title: "Extracted",
        description: mongoFailed
          ? `${data.total_ingested} document(s) processed. ⚠ MongoDB save failed — controls visible this session only.`
          : `${data.total_ingested} document(s) added. ${data.merged_count} controls after deduplication.`,
        variant: mongoFailed ? "destructive" : "default",
      });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Ingest failed", variant: "destructive" });
    } finally {
      setIngesting(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(`/api/controls-library/documents/${docId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setControlsDocs(prev => prev.filter(d => d.document_id !== docId));
      if (selectedDoc?.document_id === docId) {
        setSelectedDoc(null);
        setRightPanelView("dashboard");
      }
      fetchAllControls();
      refreshMetrics();
      toast({ title: "Deleted", description: "Document removed from controls library" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
    }
  };

  const handleClearLibrary = async () => {
    setClearingLibrary(true);
    setShowClearConfirm(false);
    try {
      const res = await fetch("/api/controls-library/all", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Clear failed");
      setControlsDocs([]);
      setDashboardControls([]);
      setMergedControls(null);
      setSelectedDoc(null);
      setDocCache({});
      setRightPanelView("dashboard");
      refreshMetrics();
      toast({ title: "Library cleared", description: `${data.deleted_count} document(s) removed` });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Clear failed", variant: "destructive" });
    } finally {
      setClearingLibrary(false);
    }
  };

  const handleRemapObligations = async () => {
    setRemapping(true);
    try {
      const res = await fetch("/api/controls-library/remap-obligations", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Remap failed");
      toast({ title: "Obligations mapped", description: `${data.controls_updated} controls updated across ${data.documents_processed} document(s).` });
      setMergedControls(null);
      setDocCache({});
      setSelectedDoc(null);
      await fetchAllControls();
      refreshMetrics();
    } catch (err) {
      toast({ title: "Remap failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRemapping(false);
    }
  };

  const handleDocClick = async (doc: ControlsDocument) => {
    if (selectedDoc?.document_id === doc.document_id) {
      setSelectedDoc(null);
      setRightPanelView("dashboard");
      return;
    }
    if (docCache[doc.document_id]) {
      setSelectedDoc(docCache[doc.document_id]);
      setRightPanelView("controls");
      setControlsViewMode("document");
      setDomainFilter("all");
      setTypeFilter("all");
      setSearch("");
      return;
    }
    setDetailLoading(true);
    setRightPanelView("controls");
    setControlsViewMode("document");
    try {
      const res = await fetch(`/api/controls-library/documents/${doc.document_id}`);
      const data = await res.json();
      if (data.success && data.document) {
        const full = data.document as ControlsDocumentFull;
        setDocCache(prev => ({ ...prev, [doc.document_id]: full }));
        setSelectedDoc(full);
        setDomainFilter("all");
        setTypeFilter("all");
        setSearch("");
      } else {
        toast({ title: "Warning", description: "Could not load controls — showing summary only.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Warning", description: "Could not load controls.", variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchMerged = async () => {
    setMergedLoading(true);
    setMergedControls(null);
    try {
      const res = await fetch("/api/controls-library/merged");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to fetch merged controls");
      setMergedControls(data.merged_controls || []);
      setControlsViewMode("merged");
      setRightPanelView("controls");
      setDomainFilter("all");
      setTypeFilter("all");
      setSearch("");
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Merge failed", variant: "destructive" });
    } finally {
      setMergedLoading(false);
    }
  };

  const fetchMergedStats = async () => {
    setMergedStatsLoading(true);
    try {
      const res = await fetch("/api/controls-library/merged");
      const data = await res.json();
      if (data.merged_controls) {
        setMergedCtrlStats({ total_raw: dashboardControls.length, total_merged: data.merged_controls.length });
      }
    } catch { /* non-fatal */ }
    finally { setMergedStatsLoading(false); }
  };

  // ── Derived metrics ─────────────────────────────────────────────────────────

  const allDomainCounts: Record<string, number> = {};
  let totalRawControls = 0;
  for (const doc of controlsDocs) {
    totalRawControls += doc.total_controls ?? 0;
    for (const [d, cnt] of Object.entries(doc.controls_by_domain ?? {})) {
      allDomainCounts[d] = (allDomainCounts[d] ?? 0) + cnt;
    }
  }
  const sortedDomains = Object.entries(allDomainCounts).sort((a, b) => b[1] - a[1]);
  const allDomainNames = sortedDomains.map(([d]) => d);
  const maxDomainCount = sortedDomains[0]?.[1] ?? 1;

  // Controls shown in the panel
  const activeControls: (ExtractedControl | MergedControl)[] =
    controlsViewMode === "merged"
      ? (mergedControls ?? [])
      : (selectedDoc?.controls ?? []);

  const allActiveControlDomains = Array.from(new Set(activeControls.map(c => c.domain)));
  const allActiveControlTypes = Array.from(new Set(activeControls.map(c => c.control_type)));

  const filteredControls = activeControls.filter(c =>
    (domainFilter === "all" || c.domain === domainFilter) &&
    (typeFilter === "all" || c.control_type === typeFilter) &&
    (search === "" ||
      c.control_id.toLowerCase().includes(search.toLowerCase()) ||
      c.control_name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.document_reference.toLowerCase().includes(search.toLowerCase()))
  );

  // Obligation coverage (controls with at least 1 mapped obligation)
  const coveredCount = activeControls.filter(c => c.mapped_obligations?.length > 0).length;
  const coveragePct = activeControls.length > 0 ? Math.round((coveredCount / activeControls.length) * 100) : 0;

  // ── 5W1H Quality Analytics (populated from backend /quality-analysis endpoint) ──
  const ragCounts = { green: 0, amber: 0, red: 0 };
  const w1hTotals: Record<keyof W1HResult, number> = { who: 0, what: 0, where: 0, how: 0, when: 0, why: 0 };
  const domainRag: Record<string, { green: number; amber: number; red: number }> = {};
  for (const c of ctrlsW1H) {
    ragCounts[c.rag]++;
    for (const k of W1H_KEYS) { if (c.w1h[k]) w1hTotals[k]++; }
    if (!domainRag[c.domain]) domainRag[c.domain] = { green: 0, amber: 0, red: 0 };
    domainRag[c.domain][c.rag]++;
  }
  const avgScore = ctrlsW1H.length > 0
    ? ctrlsW1H.reduce((sum, c) => sum + c.score, 0) / ctrlsW1H.length : 0;
  const requiresImprovementCount = ragCounts.amber + ragCounts.red;
  const requiresImprovementPct = ctrlsW1H.length > 0
    ? (requiresImprovementCount / ctrlsW1H.length) * 100 : 0;

  const w1hPrevalenceData = W1H_KEYS
    .map(k => ({ element: k.toUpperCase(), count: w1hTotals[k], fill: W1H_COLORS[k] }))
    .sort((a, b) => b.count - a.count);

  const domainRagData = Object.entries(domainRag)
    .map(([domain, counts]) => ({ domain: domain.replace(/_/g, " "), ...counts, total: counts.green + counts.amber + counts.red }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const ragDonutData = [
    { name: "Green (0-1 missing)", value: ragCounts.green, color: RAG_COLOR.green },
    { name: "Amber (2 missing)",   value: ragCounts.amber, color: RAG_COLOR.amber },
    { name: "Red (3+ missing)",    value: ragCounts.red,   color: RAG_COLOR.red   },
  ].filter(d => d.value > 0);

  // Obligation-mapping KPIs (derived from dashboardControls)
  const oblMappedCount = dashboardControls.filter(c => ((c as any).mapped_obligations?.length ?? 0) > 0).length;
  const oblCoveragePct = dashboardControls.length > 0 ? (oblMappedCount / dashboardControls.length) * 100 : 0;
  const allOblScores = dashboardControls.flatMap(c => ((c as any).mapped_obligations ?? []).map((o: any) => o.match_score ?? 0));
  const avgOblMatchScore = allOblScores.length > 0 ? allOblScores.reduce((a: number, b: number) => a + b, 0) / allOblScores.length : 0;
  const qualityDuplicates = mergedCtrlStats ? Math.max(0, mergedCtrlStats.total_raw - mergedCtrlStats.total_merged) : null;

  const filteredQuality = ctrlsW1H.filter(c =>
    (qualityRagFilter === "all" || c.rag === qualityRagFilter) &&
    (qualitySearch === "" ||
      c.control_id.toLowerCase().includes(qualitySearch.toLowerCase()) ||
      c.control_name.toLowerCase().includes(qualitySearch.toLowerCase()) ||
      c.domain.toLowerCase().includes(qualitySearch.toLowerCase()))
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden select-none">
      <div className="flex-1 flex overflow-hidden">

      {/* ── MAIN PANEL ──────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* ── DASHBOARD ──────────────────────────────────────────────────────── */}
        {rightPanelView === "dashboard" && (
          <ScrollArea className="flex-1 bg-[#F0F2F7]">
            {/* Diagnostics-style hero (scrolls with content) */}
            <section className="relative overflow-hidden" style={{ background: "#0C233C", padding: "44px 0 48px" }}>
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 460,
                  height: 460,
                  background: "radial-gradient(circle, rgba(114,19,234,0.3) 0%, transparent 70%)",
                  filter: "blur(80px)",
                  top: -160,
                  right: -80,
                }}
              />
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 320,
                  height: 320,
                  background: "radial-gradient(circle, rgba(0,184,245,0.18) 0%, transparent 70%)",
                  filter: "blur(80px)",
                  bottom: -120,
                  left: "5%",
                }}
              />
              <div className="relative max-w-[1400px] mx-auto px-8 md:px-12">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-0.5 rounded bg-[#00338D]" />
                  <span className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase">Controls Library</span>
                </div>
                <h1
                  className="font-bold text-white leading-tight mb-3"
                  style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-1.5px" }}
                >
                  Controls Library
                </h1>
                <p className="text-[14px] text-white/60 max-w-[720px] leading-[1.7]">
                  Upload your GRC data once. TRACE runs key diagnostic analyses simultaneously — Quality, Duplicates, and Obligations Match — from a single dataset.
                </p>
              </div>
            </section>
            <div className="p-7 space-y-6">

              {/* ── Section A: Upload Policy Documents (collapsible) ─────────── */}
              <div>
                <button
                  type="button"
                  className="w-full flex items-center justify-between pb-4 border-b-2 border-[#E2E6EF] mb-5"
                  onClick={() => setUploadSectionOpen(o => !o)}
                >
                  <div className="text-left">
                    <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
                      Data Inputs
                    </div>
                    <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">
                      Upload Policy Documents
                    </div>
                  </div>
                  <ChevronDown
                    size={22}
                    className={`text-[#8492A6] transition-transform duration-200 ${uploadSectionOpen ? "" : "-rotate-90"}`}
                  />
                </button>
                {uploadSectionOpen && (
                  <>
                    <div
                      className={`bg-white rounded-2xl p-6 transition-all duration-200 grid grid-cols-1 md:grid-cols-3 gap-6 items-start ${
                        uploadFiles.length > 0
                          ? "border border-[#009A44] shadow-sm"
                          : "border-2 border-dashed border-[#E2E6EF] shadow-sm"
                      }`}
                    >
                      {/* Left third: icon + title + description */}
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: "#EEF2FF" }}
                          >
                            <ShieldCheck size={22} style={{ color: "#1E49E2" }} />
                          </div>
                          <div>
                            <div className="font-bold text-[#0C233C] text-[15px]">Policy Documents</div>
                            <div className="text-[12px] text-[#8492A6] mt-0.5">PDF / Word / Excel / CSV / TXT / MD / Image</div>
                          </div>
                        </div>
                        <p className="text-[13px] text-[#5A6478] leading-relaxed">
                          Upload one or more company policy documents. TRACE will extract controls,
                          classify them by domain, and map each one to regulatory obligations.
                        </p>
                      </div>

                      {/* Middle third: dropzone */}
                      <div
                        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors min-h-[160px] flex flex-col items-center justify-center ${
                          uploadFiles.length > 0
                            ? "border-[#009A44]/50 bg-[#009A44]/5"
                            : "border-[#E2E6EF] hover:border-[#1E49E2]/50 hover:bg-[#EEF2FF]/40"
                        }`}
                        onClick={() => document.getElementById("ctrl-file-input")?.click()}
                      >
                        <input
                          id="ctrl-file-input"
                          type="file"
                          multiple
                          accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
                          className="hidden"
                          onChange={e => {
                            const files = Array.from(e.target.files || []);
                            if (files.length) setUploadFiles(prev => [...prev, ...files]);
                            e.target.value = "";
                          }}
                        />
                        <Upload className="h-7 w-7 text-[#1E49E2] mb-2" />
                        <p className="text-[13px] text-[#0C233C] font-semibold">Click to browse</p>
                        <p className="text-[11px] text-[#8492A6] mt-0.5">
                          PDF, Word, TXT, MD, Excel, CSV or image
                        </p>
                        <button
                          type="button"
                          className="mt-3 inline-flex items-center gap-2 text-[12px] font-semibold rounded-lg px-3.5 py-1.5 transition-colors"
                          style={{ background: "#EEF2FF", color: "#1E49E2" }}
                          onClick={e => { e.stopPropagation(); document.getElementById("ctrl-file-input")?.click(); }}
                        >
                          <Upload size={13} />
                          Choose File
                        </button>
                      </div>

                      {/* Right third: queued files / extract button / placeholder */}
                      <div className="flex flex-col gap-3 min-h-[160px]">
                        {uploadFiles.length === 0 ? (
                          <div className="flex flex-col items-center justify-center text-center h-full py-6 border border-dashed border-[#E2E6EF] rounded-xl bg-[#F7F9FC]">
                            <FileText className="h-7 w-7 text-[#8492A6]/50 mb-2" />
                            <p className="text-[12px] text-[#5A6478] font-semibold">No files queued</p>
                            <p className="text-[11px] text-[#8492A6] mt-0.5 max-w-[200px]">
                              Selected files will appear here before extraction
                            </p>
                          </div>
                        ) : (
                          <>
                            <p className="text-[10px] font-bold text-[#00338D] uppercase tracking-[1.5px]">
                              {uploadFiles.length} file{uploadFiles.length !== 1 ? "s" : ""} queued
                            </p>
                            <div className="max-h-32 overflow-auto space-y-1 pr-0.5">
                              {uploadFiles.map((f, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-xs bg-[#F7F9FC] border border-[#E2E6EF] rounded-md px-2 py-1.5">
                                  <FileText className="h-3 w-3 text-[#8492A6] shrink-0 mt-px" />
                                  <span className="flex-1 break-all leading-tight min-w-0 text-[#0C233C]">{f.name}</span>
                                  <button
                                    type="button"
                                    className="h-4 w-4 shrink-0 mt-px inline-flex items-center justify-center text-[#8492A6] hover:text-[#0C233C]"
                                    onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center gap-2 text-[13px] font-semibold text-white rounded-xl px-4 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-wait"
                              style={{ background: "#00338D" }}
                              disabled={ingesting}
                              onClick={handleIngest}
                            >
                              {ingesting ? (
                                <>
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                                  Extracting…
                                </>
                              ) : (
                                <>
                                  <Play className="h-3.5 w-3.5" fill="white" />
                                  Extract Controls
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Recently added strip */}
                    {ingestResults.length > 0 && (
                      <div className="mt-4 bg-white rounded-2xl border border-[#009A44]/40 shadow-sm p-4">
                        <p className="text-[10px] font-bold text-[#009A44] uppercase tracking-[1.5px] mb-2">
                          Recently added
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {ingestResults.map((r, i) => (
                            <div
                              key={i}
                              className="text-xs px-3 py-1.5 bg-[#009A44]/5 border border-[#009A44]/30 rounded-lg flex items-center gap-2"
                            >
                              <FileText className="h-3 w-3 text-[#009A44] shrink-0" />
                              <span className="font-medium text-[#0C233C] break-all">{r.filename}</span>
                              <Badge variant="outline" className="text-[#009A44] border-[#009A44]/40 text-[10px]">
                                {r.total_controls} controls
                              </Badge>
                              {!r.mongo_saved && (
                                <Badge variant="outline" className="text-orange-600 border-orange-400 text-[10px]">
                                  ⚠ no DB
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Section B: Documents (horizontal grid) ───────────────────── */}
              <div>
                <div className="w-full flex items-center justify-between pb-4 border-b-2 border-[#E2E6EF] mb-5 gap-3 flex-wrap">
                  <div className="text-left">
                    <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
                      Knowledge Base
                    </div>
                    <div className="font-bold text-[#0C233C] text-[20px] tracking-tight flex items-center gap-2">
                      Documents
                      {controlsDocs.length > 0 && (
                        <span className="bg-[#0C233C] text-white px-2 py-0.5 rounded-md text-[11px] font-semibold">
                          {controlsDocs.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      title="Dashboard view"
                      onClick={() => { setRightPanelView("dashboard"); setSelectedDoc(null); }}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-colors ${
                        rightPanelView === "dashboard"
                          ? "bg-[#00338D] text-white"
                          : "bg-white border border-[#E2E6EF] text-[#5A6478] hover:border-[#00338D]"
                      }`}
                    >
                      <LayoutDashboard className="h-3.5 w-3.5" />
                      Dashboard
                    </button>
                    <button
                      type="button"
                      title="Merged view (all docs deduplicated)"
                      disabled={controlsDocs.length === 0 || mergedLoading}
                      onClick={fetchMerged}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        controlsViewMode === "merged" && rightPanelView === "controls"
                          ? "bg-[#00338D] text-white"
                          : "bg-white border border-[#E2E6EF] text-[#5A6478] hover:border-[#00338D]"
                      }`}
                    >
                      {mergedLoading ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                      ) : (
                        <Layers className="h-3.5 w-3.5" />
                      )}
                      Merged
                    </button>
                    <button
                      type="button"
                      title="Refresh documents"
                      onClick={fetchDocs}
                      disabled={docsLoading}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-[#E2E6EF] text-[#5A6478] hover:border-[#00338D] hover:text-[#00338D] transition-colors"
                    >
                      <RotateCcw className={`h-3.5 w-3.5 ${docsLoading ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      type="button"
                      disabled={remapping || controlsDocs.length === 0}
                      onClick={handleRemapObligations}
                      title="Re-map all controls to regulatory obligations"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-[#00338D] text-white hover:bg-[#1E49E2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {remapping ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                          Remapping…
                        </>
                      ) : (
                        <>
                          <Link2 className="h-3.5 w-3.5" />
                          Map Obligations
                        </>
                      )}
                    </button>
                    {controlsDocs.length > 0 && (
                      <button
                        type="button"
                        title="Clear entire controls library"
                        disabled={clearingLibrary}
                        onClick={() => setShowClearConfirm(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-white border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear Library
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline clear confirmation */}
                {showClearConfirm && (
                  <div className="mb-4 p-4 rounded-2xl border border-red-300 bg-red-50 space-y-2">
                    <p className="text-[13px] font-semibold text-red-700">Clear entire controls library?</p>
                    <p className="text-[12px] text-red-600/80">
                      This will permanently delete all {controlsDocs.length} document(s) and their extracted controls.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                        onClick={handleClearLibrary}
                        disabled={clearingLibrary}
                      >
                        {clearingLibrary ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                            Clearing…
                          </>
                        ) : (
                          "Yes, clear all"
                        )}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold bg-white border border-[#E2E6EF] text-[#5A6478] hover:border-[#00338D] transition-colors"
                        onClick={() => setShowClearConfirm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Documents grid */}
                {docsLoading ? (
                  <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-12 flex justify-center">
                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#1E49E2]" />
                  </div>
                ) : controlsDocs.length === 0 ? (
                  <div className="bg-white rounded-2xl border-2 border-dashed border-[#E2E6EF] shadow-sm p-12 flex flex-col items-center justify-center text-center">
                    <BookOpen className="h-12 w-12 text-[#8492A6]/40 mb-3" />
                    <p className="text-[14px] font-semibold text-[#5A6478]">No documents yet</p>
                    <p className="text-[12px] text-[#8492A6] mt-1">Upload a policy document above to populate the library</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {controlsDocs.map((doc, i) => {
                      const isSelected = selectedDoc?.document_id === doc.document_id;
                      const topDomains = Object.entries(doc.controls_by_domain ?? {})
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3);
                      return (
                        <div
                          key={i}
                          className={`bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-5 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-all ${
                            isSelected ? "ring-2 ring-[#00338D]" : ""
                          }`}
                          onClick={() => handleDocClick(doc)}
                        >
                          {/* Top row: file icon + filename + delete */}
                          <div className="flex items-start gap-2">
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: "#EEF2FF" }}
                            >
                              <FileText className="h-4 w-4" style={{ color: "#1E49E2" }} />
                            </div>
                            <p className="text-[13px] font-bold text-[#0C233C] break-all leading-snug flex-1 min-w-0">
                              {doc.source_filename}
                            </p>
                            <button
                              type="button"
                              className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-red-500 hover:bg-red-50 transition-colors"
                              onClick={e => { e.stopPropagation(); handleDelete(doc.document_id); }}
                              title="Delete document"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Middle: total controls badge + per-domain badges */}
                          <div className="flex flex-wrap gap-1.5">
                            <span className="bg-[#0C233C] text-white px-2 py-0.5 rounded-md text-[11px] font-semibold">
                              {doc.total_controls} controls
                            </span>
                            {topDomains.map(([d, cnt], di) => {
                              const hue = HUES[allDomainNames.indexOf(d) % HUES.length];
                              return (
                                <span
                                  key={di}
                                  className="text-[11px] font-semibold px-2 py-0.5 rounded-md border capitalize"
                                  style={{
                                    borderColor: `hsl(${hue},55%,55%)`,
                                    color: `hsl(${hue},65%,28%)`,
                                    background: `hsl(${hue},55%,96%)`,
                                  }}
                                >
                                  {d.replace(/_/g, " ")} · {cnt}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">Controls Library</div>
                  <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight">Library Dashboard</h2>
                </div>
                {controlsDocs.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {(["overview", "quality"] as const).map(tab => (
                      <button
                        key={tab}
                        className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-full border-[1.5px] transition-all ${
                          dashboardTab === tab
                            ? "bg-[#00338D] text-white border-[#00338D]"
                            : "bg-white text-[#8492A6] border-[#E2E6EF] hover:border-[#00338D] hover:text-[#00338D]"
                        }`}
                        onClick={() => setDashboardTab(tab)}
                      >
                        {tab === "quality" ? <><Activity className="inline h-3 w-3 mr-1" />Quality Analysis</> : "Overview"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {controlsDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <ShieldCheck className="h-12 w-12 text-[#8492A6]/40 mb-3" />
                  <p className="text-[14px] font-semibold text-[#5A6478]">No policy documents ingested yet</p>
                  <p className="text-[12px] text-[#8492A6] mt-1">Upload a company policy document to extract controls</p>
                </div>
              ) : (
                <>
                  {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
                  {dashboardTab === "overview" && (
                  <div className="space-y-6">

                  {/* Section header */}
                  <div>
                    <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">Library Snapshot</div>
                    <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight pb-4 border-b-2 border-[#E2E6EF]">Key Metrics</h2>
                  </div>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {([
                      { label: "Documents",       value: controlsDocs.length,    sub: "policy files",      accent: "#1E49E2" },
                      { label: "Total Controls",  value: totalRawControls,        sub: "extracted",         accent: "#7213EA" },
                      { label: "Domains Covered", value: sortedDomains.length,    sub: "security domains",  accent: "#098E7E" },
                    ] as { label: string; value: number; sub: string; accent: string }[]).map((kpi, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative overflow-hidden flex flex-col gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                      >
                        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: kpi.accent }} />
                        <p className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase mt-1">{kpi.label}</p>
                        <div>
                          <p className="font-bold text-[38px] text-[#0C233C] leading-none tracking-tight">{kpi.value}</p>
                          <p className="text-[13px] text-[#8492A6] mt-1">{kpi.sub}</p>
                        </div>
                      </div>
                    ))}
                    <div
                      className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative overflow-hidden flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                      onClick={controlsDocs.length > 0 ? fetchMerged : undefined}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: "#EAAA00" }} />
                      <p className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase mt-1">Merged View</p>
                      <div>
                        <p className="font-bold text-[38px] text-[#0C233C] leading-none tracking-tight flex items-center gap-1">
                          {mergedLoading
                            ? <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#7213EA]" />
                            : mergedControls !== null
                              ? mergedControls.length
                              : "—"
                          }
                        </p>
                        <p className="text-[13px] text-[#8492A6] mt-1">
                          {mergedControls !== null ? "after deduplication" : "click to compute"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Domain Distribution — clickable filter bars */}
                  <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 space-y-3 transition-all duration-200 hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-[#0C233C] text-[17px]">Domain Distribution</h3>
                        <p className="text-[13px] text-[#8492A6] mt-0.5">Click a bar to filter controls below</p>
                      </div>
                      {dashboardDomainFilter !== "all" && (
                        <button
                          className="text-[11px] font-semibold text-[#5A6478] hover:text-[#0C233C] underline underline-offset-2 transition-colors"
                          onClick={() => setDashboardDomainFilter("all")}
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {sortedDomains.map(([domain, cnt], i) => {
                        const hue = HUES[i % HUES.length];
                        const pct = Math.round((cnt / maxDomainCount) * 100);
                        const isActive = dashboardDomainFilter === domain;
                        return (
                          <div
                            key={domain}
                            className={`flex items-center gap-3 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                              isActive ? "bg-[#F0F2F7] ring-1 ring-[#1E49E2]/30" : "hover:bg-[#F7F9FC]"
                            }`}
                            onClick={() => setDashboardDomainFilter(isActive ? "all" : domain)}
                          >
                            <span
                              className="text-xs font-semibold w-36 shrink-0 capitalize leading-tight"
                              style={{ color: `hsl(${hue},60%,${isActive ? 35 : 40}%)` }}
                            >
                              {domain.replace(/_/g, " ")}
                            </span>
                            <div className="flex-1 h-3.5 bg-[#E2E6EF] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background: `hsl(${hue},${isActive ? 70 : 55}%,${isActive ? 48 : 58}%)`,
                                  opacity: dashboardDomainFilter !== "all" && !isActive ? 0.35 : 1,
                                }}
                              />
                            </div>
                            <span className="text-xs text-[#5A6478] w-8 text-right shrink-0 font-semibold">{cnt}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* All Controls list */}
                  <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-[#E2E6EF] bg-[#F7F9FC] space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <h3 className="font-bold text-[#0C233C] text-[17px]">
                            All Controls
                            {dashboardDomainFilter !== "all" && (
                              <span className="ml-2 text-[12px] font-medium text-[#8492A6] capitalize">
                                — {dashboardDomainFilter.replace(/_/g, " ")}
                              </span>
                            )}
                          </h3>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {(() => {
                            const filtered = dashboardControls.filter(c =>
                              (dashboardDomainFilter === "all" || c.domain === dashboardDomainFilter) &&
                              (dashboardSearch === "" ||
                                c.control_id.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                                c.control_name.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                                c.description.toLowerCase().includes(dashboardSearch.toLowerCase()))
                            );
                            return `${filtered.length} / ${dashboardControls.length}`;
                          })()}
                        </Badge>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8492A6]" />
                        <Input
                          className="pl-8 h-8 text-xs bg-white"
                          placeholder="Search controls…"
                          value={dashboardSearch}
                          onChange={e => setDashboardSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    {dashboardLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#7213EA]" />
                      </div>
                    ) : (
                      <div className="space-y-2 p-3">
                        {dashboardControls
                          .filter(c =>
                            (dashboardDomainFilter === "all" || c.domain === dashboardDomainFilter) &&
                            (dashboardSearch === "" ||
                              c.control_id.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                              c.control_name.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                              c.description.toLowerCase().includes(dashboardSearch.toLowerCase()))
                          )
                          .map((ctrl, i) => (
                            <ControlCard key={ctrl.control_id ?? i} ctrl={ctrl} allDomains={allDomainNames} onObligationClick={handleObligationClick} />
                          ))
                        }
                        {dashboardControls.filter(c =>
                          (dashboardDomainFilter === "all" || c.domain === dashboardDomainFilter) &&
                          (dashboardSearch === "" ||
                            c.control_id.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                            c.control_name.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                            c.description.toLowerCase().includes(dashboardSearch.toLowerCase()))
                        ).length === 0 && !dashboardLoading && (
                          <p className="text-[13px] text-[#8492A6] text-center py-6">
                            {dashboardControls.length === 0 ? "No controls extracted yet." : "No controls match the current filter."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  </div>
                  )} {/* end overview tab */}

                  {/* ── QUALITY ANALYSIS TAB ─────────────────────────────── */}
                  {dashboardTab === "quality" && (
                    ctrlsW1H.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Activity className="h-12 w-12 text-[#8492A6]/40 mb-3" />
                        <p className="text-[14px] font-semibold text-[#5A6478]">No controls to analyze yet</p>
                        <p className="text-[12px] text-[#8492A6] mt-1">Extract controls from a policy document first</p>
                      </div>
                    ) : (
                      <div className="space-y-7">

                        {/* Section header */}
                        <div>
                          <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">Quality Snapshot</div>
                          <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight pb-4 border-b-2 border-[#E2E6EF]">5W1H Quality Overview</h2>
                        </div>

                        {/* KPI Row */}
                        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative overflow-hidden flex flex-col gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: "#1E49E2" }} />
                            <p className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase mt-1">Total Controls Assessed</p>
                            <div>
                              <p className="font-bold text-[38px] text-[#0C233C] leading-none tracking-tight">{ctrlsW1H.length}</p>
                              <p className="text-[13px] text-[#8492A6] mt-1">across {sortedDomains.length} process areas</p>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative overflow-hidden flex flex-col gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: avgScore >= 5 ? RAG_COLOR.green : avgScore >= 4 ? RAG_COLOR.amber : RAG_COLOR.red }} />
                            <p className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase mt-1">Avg Quality Score</p>
                            <div>
                              <p className="font-bold text-[38px] leading-none tracking-tight" style={{ color: avgScore >= 5 ? RAG_COLOR.green : avgScore >= 4 ? RAG_COLOR.amber : RAG_COLOR.red }}>
                                {avgScore.toFixed(2)}<span className="text-[18px] tracking-normal text-[#8492A6]">/6</span>
                              </p>
                              <p className="text-[13px] text-[#8492A6] mt-1">mean 5W1H elements present</p>
                            </div>
                            <div className="w-full h-1.5 bg-[#E2E6EF] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(avgScore/6)*100}%`, background: avgScore >= 5 ? RAG_COLOR.green : avgScore >= 4 ? RAG_COLOR.amber : RAG_COLOR.red }} />
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative overflow-hidden flex flex-col gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: RAG_COLOR.red }} />
                            <p className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase mt-1">Requires Improvement</p>
                            <div>
                              <p className="font-bold text-[38px] leading-none tracking-tight" style={{ color: RAG_COLOR.red }}>{requiresImprovementPct.toFixed(1)}%</p>
                              <p className="text-[13px] text-[#8492A6] mt-1">{requiresImprovementCount} controls (amber + red)</p>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative overflow-hidden flex flex-col gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: RAG_COLOR.green }} />
                            <p className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase mt-1">Green — No Action</p>
                            <div>
                              <p className="font-bold text-[38px] leading-none tracking-tight" style={{ color: RAG_COLOR.green }}>{ragCounts.green}</p>
                              <p className="text-[13px] text-[#8492A6] mt-1">
                                {ctrlsW1H.length > 0 ? `${(ragCounts.green/ctrlsW1H.length*100).toFixed(1)}% of corpus` : "—"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Obligation Mapping section header */}
                        <div>
                          <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">Obligation Mapping</div>
                          <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight pb-4 border-b-2 border-[#E2E6EF]">Coverage & Match Quality</h2>
                        </div>

                        {/* Obligation Mapping KPI Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative overflow-hidden flex flex-col gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: "#009A44" }} />
                            <p className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase mt-1">Controls–Obligations Coverage</p>
                            <div>
                              <p className="font-bold text-[38px] leading-none tracking-tight" style={{ color: "#009A44" }}>{oblCoveragePct.toFixed(1)}%</p>
                              <p className="text-[13px] text-[#8492A6] mt-1">{oblMappedCount} of {dashboardControls.length} controls mapped</p>
                            </div>
                            <div className="w-full h-1.5 bg-[#E2E6EF] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${oblCoveragePct}%`, background: "#009A44" }} />
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative overflow-hidden flex flex-col gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: "#7213EA" }} />
                            <p className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase mt-1">Avg Obligation Match Score</p>
                            <div>
                              <p className="font-bold text-[38px] leading-none tracking-tight" style={{ color: "#7213EA" }}>
                                {avgOblMatchScore.toFixed(3)}<span className="text-[18px] tracking-normal text-[#8492A6]">/1.0</span>
                              </p>
                              <p className="text-[13px] text-[#8492A6] mt-1">across {allOblScores.length} obligation links</p>
                            </div>
                            <div className="w-full h-1.5 bg-[#E2E6EF] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${avgOblMatchScore * 100}%`, background: "#7213EA" }} />
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative overflow-hidden flex flex-col gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: "#EAAA00" }} />
                            <p className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase mt-1">Potential Duplicates</p>
                            <div>
                              {mergedStatsLoading ? (
                                <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#EAAA00]" />
                              ) : (
                                <p className="font-bold text-[38px] leading-none tracking-tight" style={{ color: "#EAAA00" }}>
                                  {qualityDuplicates !== null ? qualityDuplicates : "—"}
                                </p>
                              )}
                              <p className="text-[13px] text-[#8492A6] mt-1">
                                {mergedCtrlStats
                                  ? `${mergedCtrlStats.total_raw} raw → ${mergedCtrlStats.total_merged} merged`
                                  : mergedStatsLoading ? "computing…" : "loading…"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Charts section header */}
                        <div>
                          <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">Distribution</div>
                          <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight pb-4 border-b-2 border-[#E2E6EF]">Quality Charts</h2>
                        </div>

                        {/* Charts Row */}
                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

                          {/* 5W1H Prevalence Bar */}
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="font-bold text-[#0C233C] text-[17px] mb-1">5W1H Element Prevalence</div>
                            <p className="text-[13px] text-[#8492A6] mb-4">Controls with each element present</p>
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={w1hPrevalenceData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                                <XAxis type="number" domain={[0, ctrlsW1H.length]} tick={{ fontSize: 11, fill: "#8492A6" }} tickLine={false} axisLine={false} />
                                <YAxis type="category" dataKey="element" tick={{ fontSize: 12, fontWeight: 700, fill: "#2D3748" }} tickLine={false} axisLine={false} width={45} />
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(v: number) => [v, "Controls"]} />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={26}>
                                  {w1hPrevalenceData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* RAG Donut */}
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="font-bold text-[#0C233C] text-[17px] mb-1">RAG Distribution</div>
                            <p className="text-[13px] text-[#8492A6] mb-4">Quality rating across all {ctrlsW1H.length} controls</p>
                            <div className="relative">
                              <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                  <Pie data={ragDonutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={0}>
                                    {ragDonutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                                  </Pie>
                                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(v: number) => [v, "Controls"]} />
                                </PieChart>
                              </ResponsiveContainer>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="font-bold text-[22px] text-[#0C233C] tracking-tight leading-none">{ctrlsW1H.length}</span>
                                <span className="text-[10px] text-[#8492A6] font-semibold uppercase tracking-wider mt-0.5">controls</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 mt-3">
                              {ragDonutData.map(d => (
                                <div key={d.name} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                                    <span className="text-[12px] text-[#5A6478]">{d.name}</span>
                                  </div>
                                  <span className="text-[12px] font-bold text-[#0C233C]">{d.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* RAG by Process Area */}
                          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                            <div className="font-bold text-[#0C233C] text-[17px] mb-1">Quality RAG by Process Area</div>
                            <p className="text-[13px] text-[#8492A6] mb-4">Green / Amber / Red breakdown per area</p>
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={domainRagData} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                                <XAxis type="number" tick={{ fontSize: 11, fill: "#8492A6" }} tickLine={false} axisLine={false} />
                                <YAxis type="category" dataKey="domain" tick={{ fontSize: 10, fill: "#2D3748" }} tickLine={false} axisLine={false} width={80} />
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="green" name="Green" stackId="rag" fill={RAG_COLOR.green} />
                                <Bar dataKey="amber" name="Amber" stackId="rag" fill={RAG_COLOR.amber} />
                                <Bar dataKey="red" name="Red" stackId="rag" fill={RAG_COLOR.red} radius={[0, 4, 4, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* 5W1H Scores Detail section header */}
                        <div>
                          <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">Control Detail</div>
                          <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight pb-4 border-b-2 border-[#E2E6EF]">5W1H Scores by Control</h2>
                        </div>

                        {/* 5W1H Scores Detail Table */}
                        <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm overflow-hidden">
                          <div className="p-5 border-b border-[#E2E6EF] bg-[#F7F9FC] space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              {(["all", "red", "amber", "green"] as const).map(f => (
                                <button
                                  key={f}
                                  className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-full border-[1.5px] transition-all capitalize ${
                                    qualityRagFilter === f
                                      ? f === "all"
                                        ? "bg-[#00338D] text-white border-[#00338D]"
                                        : "border-transparent text-white"
                                      : "bg-white text-[#8492A6] border-[#E2E6EF] hover:border-[#00338D] hover:text-[#00338D]"
                                  }`}
                                  style={qualityRagFilter === f && f !== "all" ? { background: RAG_COLOR[f], borderColor: RAG_COLOR[f] } : {}}
                                  onClick={() => setQualityRagFilter(f)}
                                >
                                  {f === "all" ? `All (${ctrlsW1H.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${ragCounts[f]})`}
                                </button>
                              ))}
                              <div className="relative ml-auto">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8492A6]" />
                                <input
                                  className="pl-8 h-8 text-[12px] border border-[#E2E6EF] rounded-lg bg-white pr-2 focus:outline-none focus:ring-1 focus:ring-[#00338D]/40 w-44"
                                  placeholder="Search…"
                                  value={qualitySearch}
                                  onChange={e => setQualitySearch(e.target.value)}
                                />
                              </div>
                              <button
                                className="inline-flex items-center gap-2 text-[12px] font-semibold text-white bg-[#00338D] rounded-lg px-3.5 py-1.5 hover:bg-[#1E49E2] transition-colors"
                                onClick={() => exportQualityCSV(filteredQuality)}
                              >
                                <Download className="h-3 w-3" />
                                Export CSV
                              </button>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="bg-[#F7F9FC] border-b border-[#E2E6EF]">
                                  <th className="text-left px-3 py-3 text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] w-24">Control ID</th>
                                  <th className="text-left px-3 py-3 text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px]">Control Title</th>
                                  <th className="text-left px-3 py-3 text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px]">Control Text</th>
                                  <th className="text-left px-3 py-3 text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] w-28">Process Area</th>
                                  {W1H_KEYS.map(k => (
                                    <th key={k} className="text-center px-1 py-3 text-[11px] font-bold uppercase tracking-[1px] w-10" style={{ color: W1H_COLORS[k] }}>
                                      {k.toUpperCase()}
                                    </th>
                                  ))}
                                  <th className="text-center px-2 py-3 text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] w-12">Score</th>
                                  <th className="text-center px-2 py-3 text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] w-14">RAG</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredQuality.slice(0, 200).map((c, i) => {
                                  const obligationsText = (c.mapped_obligations && c.mapped_obligations.length > 0)
                                    ? c.mapped_obligations
                                        .map((o: any) => o.obligation_id || o.id || o.title || o.name || "")
                                        .filter(Boolean)
                                        .join(", ")
                                    : "—";
                                  const processArea = (c.domain || "").replace(/_/g, " ") || "—";
                                  const tooltip =
`${c.control_name || c.control_id}

${c.description || ""}

Process Area: ${processArea}
Obligations: ${obligationsText}`;
                                  return (
                                  <tr key={c.control_id ?? i} title={tooltip} className="border-b border-[#E2E6EF] last:border-0 hover:bg-[#FAFBFD] transition-colors">
                                    <td
                                      className="px-3 py-2.5 font-mono text-[11px] text-[#00338D] hover:text-[#1E49E2] cursor-pointer hover:underline font-bold"
                                      onClick={() => setSelectedQualityControl(c)}
                                    >{c.control_id}</td>
                                    <td className="px-3 py-2.5 text-[12px] text-[#0C233C] leading-tight max-w-xs">
                                      <span className="line-clamp-2">{c.control_name}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-[12px] text-[#5A6478] leading-tight max-w-md">
                                      <span className="line-clamp-2">{c.description}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-[12px] text-[#5A6478] capitalize">{c.domain?.replace(/_/g, " ")}</td>
                                    {W1H_KEYS.map(k => (
                                      <td key={k} className="text-center px-1 py-2.5">
                                        {c.w1h[k]
                                          ? <span style={{ color: W1H_COLORS[k] }}>✓</span>
                                          : <span className="text-[#8492A6]/50">✗</span>
                                        }
                                      </td>
                                    ))}
                                    <td className="text-center px-2 py-2.5 font-mono font-bold text-[#0C233C]">{c.score}/6</td>
                                    <td className="text-center px-2 py-2.5">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${RAG_BG[c.rag]}`}>
                                        {c.rag.charAt(0).toUpperCase() + c.rag.slice(1)}
                                      </span>
                                    </td>
                                  </tr>
                                  );
                                })}
                                {filteredQuality.length === 0 && (
                                  <tr><td colSpan={11} className="text-center py-6 text-[#8492A6]">No controls match filter.</td></tr>
                                )}
                              </tbody>
                            </table>
                            {filteredQuality.length > 200 && (
                              <p className="text-[11px] text-[#8492A6] text-center py-3 border-t border-[#E2E6EF]">
                                Showing 200 of {filteredQuality.length} — use Export CSV for full data
                              </p>
                            )}
                          </div>
                        </div>

                      </div>
                    )
                  )} {/* end quality tab */}

                </>
              )}
            </div>
            <Footer />
          </ScrollArea>
        )}

        {/* ── CONTROLS VIEW ──────────────────────────────────────────────────── */}
        {rightPanelView === "controls" && (
          <div className="flex flex-col flex-1 overflow-hidden">

            {/* Controls view header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#E2E6EF] bg-white gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setRightPanelView("dashboard"); setSelectedDoc(null); }}
                  title="Back to dashboard"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-[#5A6478] hover:text-[#0C233C] hover:bg-[#F0F2F7] transition-colors"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </button>
                <div className="h-5 w-px bg-[#E2E6EF]" />
                <List className="h-4 w-4 text-[#00338D]" />
                <span className="text-[14px] font-bold text-[#0C233C]">
                  {controlsViewMode === "merged" ? "Merged Controls" : selectedDoc?.source_filename ?? "Controls"}
                </span>
                {controlsViewMode === "merged" && mergedControls && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#0C233C] text-white">
                    {filteredControls.length} / {mergedControls.length}
                  </span>
                )}
                {controlsViewMode === "document" && selectedDoc && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#0C233C] text-white">
                    {filteredControls.length} / {selectedDoc.controls?.length ?? 0}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={!selectedDoc}
                  onClick={() => { setControlsViewMode("document"); setDomainFilter("all"); setTypeFilter("all"); setSearch(""); }}
                  className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    controlsViewMode === "document"
                      ? "bg-[#00338D] text-white border-[#00338D]"
                      : "bg-white text-[#0C233C] border-[#E2E6EF] hover:border-[#00338D] hover:text-[#00338D]"
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Document
                </button>
                <button
                  disabled={controlsDocs.length === 0}
                  onClick={mergedControls !== null
                    ? () => { setControlsViewMode("merged"); setDomainFilter("all"); setTypeFilter("all"); setSearch(""); }
                    : fetchMerged
                  }
                  className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    controlsViewMode === "merged"
                      ? "bg-[#00338D] text-white border-[#00338D]"
                      : "bg-white text-[#0C233C] border-[#E2E6EF] hover:border-[#00338D] hover:text-[#00338D]"
                  }`}
                >
                  {mergedLoading
                    ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
                    : <Layers className="h-3.5 w-3.5" />
                  }
                  Merged
                </button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="px-5 py-4 border-b border-[#E2E6EF] bg-white space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8492A6]" />
                <input
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E2E6EF] bg-white text-[12px] text-[#0C233C] placeholder:text-[#8492A6] focus:outline-none focus:border-[#00338D] focus:ring-2 focus:ring-[#00338D]/15"
                  placeholder="Search controls…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {/* Domain filter */}
              <div>
                <p className="text-[10px] font-bold text-[#00338D] uppercase tracking-[1.5px] mb-1.5">Domain</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={domainFilter === "all" ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setDomainFilter("all")}
                  >All</Badge>
                  {allActiveControlDomains.map(d => {
                    const hue = domainHue(d, allDomainNames.length ? allDomainNames : allActiveControlDomains);
                    return (
                      <Badge
                        key={d}
                        variant={domainFilter === d ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        style={domainFilter !== d ? { borderColor: `hsl(${hue},60%,60%)`, color: `hsl(${hue},60%,40%)` } : {}}
                        onClick={() => setDomainFilter(d)}
                      >
                        {d.replace(/_/g, " ")}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              {/* Type filter */}
              <div>
                <p className="text-[10px] font-bold text-[#00338D] uppercase tracking-[1.5px] mb-1.5">Control Type</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={typeFilter === "all" ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setTypeFilter("all")}
                  >All</Badge>
                  {allActiveControlTypes.map(t => (
                    <Badge
                      key={t}
                      variant={typeFilter === t ? "default" : "outline"}
                      className={`cursor-pointer text-xs ${typeFilter !== t ? (CONTROL_TYPE_COLOR[t] ?? "") : ""}`}
                      onClick={() => setTypeFilter(t)}
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Controls list */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {detailLoading && (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                )}
                {!detailLoading && filteredControls.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    {activeControls.length === 0 ? "No controls available." : "No controls match the current filters."}
                  </p>
                )}
                {!detailLoading && filteredControls.map((ctrl, i) => (
                  <ControlCard
                    key={ctrl.control_id ?? i}
                    ctrl={ctrl}
                    allDomains={allDomainNames.length ? allDomainNames : allActiveControlDomains}
                    isMerged={controlsViewMode === "merged"}
                    onObligationClick={handleObligationClick}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
      </div>

      {/* ── Control Detail Modal ─────────────────────────────────────────────── */}
      {selectedQualityControl && (
      <Dialog open={!!selectedQualityControl} onOpenChange={open => { if (!open) setSelectedQualityControl(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <code className="text-xs font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 mt-0.5 shrink-0">
                {selectedQualityControl.control_id}
              </code>
              <DialogTitle className="text-base leading-snug">{selectedQualityControl.control_name}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            {/* Citation */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-1.5">
              <p className="text-[10px] font-bold tracking-widest uppercase text-amber-700 dark:text-amber-400">Citation</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground font-medium">Document</span>
                <span className="font-mono text-foreground">{selectedQualityControl._source_filename ?? "—"}</span>
                {selectedQualityControl.document_reference && (
                  <>
                    <span className="text-muted-foreground font-medium">Reference</span>
                    <span className="font-mono text-foreground">{selectedQualityControl.document_reference}</span>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">Description</p>
              <p className="text-sm leading-relaxed text-foreground">{selectedQualityControl.description}</p>
            </div>

            {/* Metadata row */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={CONTROL_TYPE_COLOR[selectedQualityControl.control_type] ?? ""}>
                {selectedQualityControl.control_type}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {selectedQualityControl.domain?.replace(/_/g, " ")}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {selectedQualityControl.specificity_level}
              </Badge>
            </div>

            {/* Keywords */}
            {selectedQualityControl.keywords?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">Keywords</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedQualityControl.keywords.map(kw => (
                    <span key={kw} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 5W1H */}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">5W1H Quality</p>
              <div className="flex gap-2 flex-wrap">
                {W1H_KEYS.map(k => (
                  <span key={k} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    selectedQualityControl.w1h[k]
                      ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
                      : "border-muted bg-muted/30 text-muted-foreground/50"
                  }`} style={selectedQualityControl.w1h[k] ? { borderColor: W1H_COLORS[k], color: W1H_COLORS[k], background: `${W1H_COLORS[k]}15` } : {}}>
                    {k.toUpperCase()} {selectedQualityControl.w1h[k] ? "✓" : "✗"}
                  </span>
                ))}
                <span className="text-[10px] px-2 py-0.5 rounded border font-bold border-muted bg-muted/30">
                  Score: {selectedQualityControl.score}/6
                </span>
              </div>
            </div>

            {/* Mapped Obligations */}
            {selectedQualityControl.mapped_obligations?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">
                  Mapped Obligations ({selectedQualityControl.mapped_obligations.length})
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedQualityControl.mapped_obligations.map((obl, i) => (
                    <div key={i} className="rounded border p-2 text-xs space-y-0.5">
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] font-mono text-primary">{obl.obligation_id}</code>
                        <Badge variant="outline" className={`text-[9px] ${ENFORCEMENT_COLOR[obl.enforcement_level] ?? ""}`}>
                          {obl.enforcement_level}
                        </Badge>
                        <span className="ml-auto text-[10px] text-muted-foreground">{obl.framework_name}</span>
                      </div>
                      <p className="text-muted-foreground leading-tight line-clamp-2">{obl.obligation_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
