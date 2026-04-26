import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, X, RotateCcw, Trash2, BookOpen,
  ChevronDown, FileText, Layers, PanelLeftClose, PanelLeftOpen,
  Network, AlertTriangle, Target, Tag,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

// ── Colors ────────────────────────────────────────────────────────────────────

const HUES = [220, 160, 30, 280, 10, 190, 120, 50, 340, 260, 90, 200];

const RISK_CATEGORY_COLOR: Record<string, string> = {
  operational:       "bg-[#EEF2FF] text-[#1E49E2] border-[#1E49E2]/30",
  strategic:         "bg-[#F3F0FF] text-[#7213EA] border-[#7213EA]/30",
  compliance:        "bg-[#FEE7E9] text-[#E5001B] border-[#E5001B]/30",
  financial:         "bg-[#FFF6DC] text-[#A57600] border-[#EAAA00]/40",
  reputational:      "bg-[#FFEDD5] text-[#C2410C] border-[#FB923C]/40",
  technology:        "bg-[#E0F4FE] text-[#0369A1] border-[#00B8F5]/40",
  people:            "bg-[#DCFCE7] text-[#009A44] border-[#009A44]/30",
  process:           "bg-[#E0E7FF] text-[#4338CA] border-[#4338CA]/30",
  quality_assurance: "bg-[#CCFBF1] text-[#098E7E] border-[#098E7E]/30",
  methodology:       "bg-[#F0F2F7] text-[#5A6478] border-[#E2E6EF]",
};

function categoryHue(cat: string, allCats: string[]): number {
  const idx = allCats.indexOf(cat);
  return HUES[idx % HUES.length];
}

// ── TypeScript interfaces ─────────────────────────────────────────────────────

interface FrameworkElement {
  element_id: string;
  element_name: string;
  description: string;
  risk_category: string;
  control_implications: string;
  applicability: string;
  keywords: string[];
  specificity_level: string;
  _source_filename?: string;
  _framework_name?: string;
}

interface MergedElement extends FrameworkElement {
  merged_from_count: number;
  source_documents: { filename: string; framework_name: string; is_primary: boolean }[];
}

interface FrameworkDocument {
  document_id: string;
  framework_name: string;
  framework_type: string;
  source_filename: string;
  upload_timestamp: string;
  model_used?: string;
  total_elements: number;
  elements_by_category?: Record<string, number>;
}

interface FrameworkDocumentFull extends FrameworkDocument {
  elements: FrameworkElement[];
}

interface GraphStats {
  graph_exists: boolean;
  last_updated: string | null;
  stats: Record<string, number>;
}

type RightPanelView = "dashboard" | "elements" | "graph";
type ElementsViewMode = "document" | "merged";

// ── Element Card ─────────────────────────────────────────────────────────────

function ElementCard({
  elem,
  allCategories,
  isMerged = false,
}: {
  elem: FrameworkElement | MergedElement;
  allCategories: string[];
  isMerged?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hue = categoryHue(elem.risk_category, allCategories);
  const mergedElem = elem as MergedElement;

  return (
    <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
      <div
        className="flex items-start gap-2 p-4 cursor-pointer"
        style={{ borderLeft: `3px solid hsl(${hue},70%,50%)` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <code className="text-[10px] font-mono text-[#5A6478] bg-[#F0F2F7] rounded px-1.5 py-0.5">
              {elem.element_id}
            </code>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${RISK_CATEGORY_COLOR[elem.risk_category] ?? "bg-[#F0F2F7] text-[#5A6478] border-[#E2E6EF]"}`}
            >
              {elem.risk_category?.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#E2E6EF] bg-white text-[#8492A6]">
              {elem.specificity_level}
            </span>
            {isMerged && mergedElem.merged_from_count > 1 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F0F2F7] text-[#5A6478] border border-[#E2E6EF] inline-flex items-center gap-1">
                <Layers className="h-2.5 w-2.5" />
                {mergedElem.merged_from_count} sources
              </span>
            )}
          </div>
          <p className="text-[14px] font-bold text-[#0C233C] leading-tight">{elem.element_name}</p>
          <p className={`text-[12px] text-[#5A6478] mt-1 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
            {elem.description}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-[#8492A6] shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>

      {expanded && (
        <div className="border-t border-[#E2E6EF] bg-[#F7F9FC] px-4 pb-4 space-y-3 pt-3">

          {/* Control Implications */}
          {elem.control_implications && (
            <div>
              <p className="text-[10px] font-bold text-[#00338D] uppercase tracking-[2px] mb-1.5 flex items-center gap-1">
                <Target className="h-3 w-3" /> Control Implications
              </p>
              <p className="text-[12px] text-[#0C233C] leading-relaxed">{elem.control_implications}</p>
            </div>
          )}

          {/* Applicability */}
          {elem.applicability && (
            <div>
              <p className="text-[10px] font-bold text-[#00338D] uppercase tracking-[2px] mb-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> When to Apply
              </p>
              <p className="text-[12px] text-[#5A6478] leading-relaxed">{elem.applicability}</p>
            </div>
          )}

          {/* Keywords */}
          {elem.keywords?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[#00338D] uppercase tracking-[2px] mb-1.5 flex items-center gap-1">
                <Tag className="h-3 w-3" /> Keywords
              </p>
              <div className="flex flex-wrap gap-1">
                {elem.keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
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
            </div>
          )}

          {/* Merged sources */}
          {isMerged && mergedElem.source_documents?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-[#00338D] uppercase tracking-[2px]">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {mergedElem.source_documents.map((src, i) => (
                  <span
                    key={i}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full max-w-[200px] truncate border ${
                      src.is_primary
                        ? "bg-[#00338D] text-white border-[#00338D]"
                        : "bg-white text-[#5A6478] border-[#E2E6EF]"
                    }`}
                    title={`${src.framework_name} — ${src.filename}`}
                  >
                    {src.is_primary && <span className="mr-1">★</span>}
                    {src.framework_name || src.filename}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source filename for non-merged */}
          {!isMerged && elem._source_filename && (
            <div className="flex items-center gap-1.5 text-[12px] text-[#8492A6]">
              <FileText className="h-3 w-3 shrink-0" />
              <span>{elem._source_filename}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FrameworksLibraryPage() {
  const { toast } = useToast();

  // Resizable left panel
  const [panelWidth, setPanelWidth] = useState(320);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: panelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const next = Math.min(600, Math.max(200, dragRef.current.startW + ev.clientX - dragRef.current.startX));
      setPanelWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [ingesting, setIngesting] = useState(false);

  // Document list
  const [frameworkDocs, setFrameworkDocs] = useState<FrameworkDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Selected document (full)
  const [selectedDoc, setSelectedDoc] = useState<FrameworkDocumentFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [docCache, setDocCache] = useState<Record<string, FrameworkDocumentFull>>({});

  // All elements (for dashboard)
  const [allElements, setAllElements] = useState<FrameworkElement[]>([]);
  const [allLoading, setAllLoading] = useState(false);

  // Merged elements
  const [mergedElements, setMergedElements] = useState<MergedElement[] | null>(null);
  const [mergedLoading, setMergedLoading] = useState(false);

  // Graph stats
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  // Right panel & view
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("dashboard");
  const [elementsViewMode, setElementsViewMode] = useState<ElementsViewMode>("document");

  // Filters
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Clear state
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => { fetchDocs(); }, []);

  // ── API helpers ───────────────────────────────────────────────────────────────

  const fetchDocs = async () => {
    setDocsLoading(true);
    try {
      const res = await fetch("/api/frameworks-library/documents");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setFrameworkDocs(data.documents ?? []);
    } catch (err) {
      console.warn("fetchDocs failed:", err);
    } finally {
      setDocsLoading(false);
    }
    fetchAllElements();
  };

  const fetchAllElements = async () => {
    setAllLoading(true);
    try {
      const res = await fetch("/api/frameworks-library/all-elements");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setAllElements(data.elements ?? []);
    } catch (err) {
      console.warn("fetchAllElements failed:", err);
    } finally {
      setAllLoading(false);
    }
  };

  const fetchMerged = async () => {
    setMergedLoading(true);
    try {
      const res = await fetch("/api/frameworks-library/merged");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setMergedElements(data.merged_elements ?? []);
    } catch (err) {
      toast({ title: "Error", description: "Failed to load merged elements", variant: "destructive" });
    } finally {
      setMergedLoading(false);
    }
  };

  const fetchGraphStats = async () => {
    setGraphLoading(true);
    try {
      const res = await fetch("/api/frameworks-library/graph-stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setGraphStats(data);
    } catch (err) {
      console.warn("fetchGraphStats failed:", err);
    } finally {
      setGraphLoading(false);
    }
  };

  const handleIngest = async () => {
    if (!uploadFiles.length) return;
    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setIngesting(true);
    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      uploadFiles.forEach(f => formData.append("framework_files", f));
      const res = await fetch("/api/frameworks-library/ingest", { method: "POST", body: formData });
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

      setUploadFiles([]);
      await fetchDocs();
      const failed = data.results?.filter((r: any) => !r.success) ?? [];
      toast({
        title: "Frameworks processed",
        description: failed.length
          ? `${data.succeeded} succeeded, ${failed.length} failed.`
          : `${data.succeeded} framework(s) added to library.`,
        variant: failed.length ? "destructive" : "default",
      });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Ingest failed", variant: "destructive" });
    } finally {
      setIngesting(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(`/api/frameworks-library/documents/${docId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setFrameworkDocs(prev => prev.filter(d => d.document_id !== docId));
      if (selectedDoc?.document_id === docId) {
        setSelectedDoc(null);
        setRightPanelView("dashboard");
      }
      setAllElements(prev => prev.filter(e => e._source_filename !== frameworkDocs.find(d => d.document_id === docId)?.source_filename));
      toast({ title: "Deleted", description: "Framework removed from library" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
    }
  };

  const handleClearLibrary = async () => {
    setClearingLibrary(true);
    setShowClearConfirm(false);
    try {
      const res = await fetch("/api/frameworks-library/all", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Clear failed");
      setFrameworkDocs([]);
      setAllElements([]);
      setMergedElements(null);
      setSelectedDoc(null);
      setDocCache({});
      setRightPanelView("dashboard");
      toast({ title: "Library cleared", description: `${data.deleted_count} document(s) removed` });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Clear failed", variant: "destructive" });
    } finally {
      setClearingLibrary(false);
    }
  };

  const handleDocClick = async (doc: FrameworkDocument) => {
    if (selectedDoc?.document_id === doc.document_id) {
      setSelectedDoc(null);
      setRightPanelView("dashboard");
      return;
    }
    if (docCache[doc.document_id]) {
      setSelectedDoc(docCache[doc.document_id]);
      setRightPanelView("elements");
      setElementsViewMode("document");
      setCategoryFilter("all");
      setSearch("");
      return;
    }
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/frameworks-library/documents/${doc.document_id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const full = data.document as FrameworkDocumentFull;
      setDocCache(prev => ({ ...prev, [doc.document_id]: full }));
      setSelectedDoc(full);
      setRightPanelView("elements");
      setElementsViewMode("document");
      setCategoryFilter("all");
      setSearch("");
    } catch (err) {
      toast({ title: "Error", description: "Failed to load document details", variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────────

  const totalElements = frameworkDocs.reduce((s, d) => s + (d.total_elements ?? 0), 0);
  const allCategories = Array.from(new Set(allElements.map(e => e.risk_category).filter(Boolean)));

  const activeElements: FrameworkElement[] =
    elementsViewMode === "merged"
      ? (mergedElements ?? [])
      : selectedDoc?.elements ?? allElements;

  const filteredElements = activeElements.filter(e => {
    if (categoryFilter !== "all" && e.risk_category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.element_name?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.control_implications?.toLowerCase().includes(q) ||
        e.keywords?.some(k => k.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // ── Drag-and-drop ─────────────────────────────────────────────────────────────

  const ACCEPTED = [".pdf", ".docx", ".doc", ".txt", ".md", ".csv", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
      ACCEPTED.some(ext => f.name.toLowerCase().endsWith(ext))
    );
    setUploadFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...files.filter(f => !names.has(f.name))];
    });
  };

  // KPI tiles config (top accent bars match diagnostics palette)
  const kpiTiles = [
    { label: "Frameworks Uploaded", value: frameworkDocs.length, accent: "#098E7E", valueColor: "#098E7E" },
    { label: "Total Elements", value: totalElements, accent: "#1E49E2", valueColor: "#1E49E2" },
    { label: "Risk Categories", value: allCategories.length, accent: "#7213EA", valueColor: "#7213EA" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-[#F0F2F7] overflow-hidden">

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left panel ── */}
        {leftPanelOpen && (
          <div
            className="flex-shrink-0 flex flex-col border-r border-[#E2E6EF] bg-white"
            style={{ width: panelWidth }}
          >
            {/* Upload area */}
            <div className="flex-shrink-0 p-4 border-b border-[#E2E6EF] space-y-2.5 bg-[#F7F9FC]">
              <div
                className="border-2 border-dashed border-[#E2E6EF] rounded-xl p-4 text-center cursor-pointer hover:border-[#1E49E2]/60 hover:bg-white transition-colors bg-white"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => document.getElementById("fw-file-input")?.click()}
              >
                <div className="w-9 h-9 mx-auto rounded-xl bg-[#EEF2FF] flex items-center justify-center mb-2">
                  <Upload className="h-4 w-4 text-[#1E49E2]" />
                </div>
                <p className="text-[12px] text-[#5A6478] leading-relaxed">
                  Drop framework files or <span className="text-[#1E49E2] font-semibold underline">browse</span>
                </p>
                <p className="text-[10px] text-[#8492A6] mt-1">PDF, DOCX, TXT, MD, CSV, Excel, image</p>
                <input
                  id="fw-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    setUploadFiles(prev => {
                      const names = new Set(prev.map(f => f.name));
                      return [...prev, ...files.filter(f => !names.has(f.name))];
                    });
                    e.target.value = "";
                  }}
                />
              </div>

              {uploadFiles.length > 0 && (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {uploadFiles.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-[11px] bg-white border border-[#E2E6EF] rounded-lg px-2.5 py-1.5"
                    >
                      <span className="flex-1 truncate text-[#0C233C] font-medium">{f.name}</span>
                      <button onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3 text-[#8492A6] hover:text-[#E5001B]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                disabled={!uploadFiles.length || ingesting}
                onClick={handleIngest}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#00338D] text-white px-4 py-2.5 rounded-xl font-bold text-[12px] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#002265] transition-colors"
              >
                {ingesting ? (
                  <><RotateCcw className="h-3.5 w-3.5 animate-spin" /> Extracting…</>
                ) : (
                  <><Upload className="h-3.5 w-3.5" /> Upload &amp; Extract</>
                )}
              </button>
            </div>

            {/* Document list */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {docsLoading ? (
                  <p className="text-[12px] text-[#8492A6] text-center py-6">Loading…</p>
                ) : !frameworkDocs.length ? (
                  <p className="text-[12px] text-[#8492A6] text-center py-6 px-3 leading-relaxed">
                    No frameworks uploaded yet. Drop a framework document above to get started.
                  </p>
                ) : (
                  frameworkDocs.map(doc => (
                    <div
                      key={doc.document_id}
                      className={`group rounded-xl border p-3 cursor-pointer transition-all duration-150 ${
                        selectedDoc?.document_id === doc.document_id
                          ? "bg-[#EEF2FF] border-[#1E49E2]"
                          : "bg-white border-[#E2E6EF] hover:border-[#1E49E2]/40 hover:shadow-sm"
                      }`}
                      onClick={() => handleDocClick(doc)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-[#0C233C] truncate">{doc.framework_name}</p>
                          <p className="text-[10px] text-[#8492A6] truncate mt-0.5">{doc.source_filename}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[#1E49E2]">
                              {doc.total_elements} elements
                            </span>
                            {doc.framework_type && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#E2E6EF] text-[#5A6478]">
                                {doc.framework_type}
                              </span>
                            )}
                          </div>
                          {doc.elements_by_category && Object.keys(doc.elements_by_category).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {Object.entries(doc.elements_by_category).slice(0, 3).map(([cat, count]) => (
                                <span
                                  key={cat}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-[#F0F2F7] text-[#5A6478] border border-[#E2E6EF]"
                                >
                                  {cat.replace(/_/g, " ")} {count}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#FEE7E9] text-[#8492A6] hover:text-[#E5001B] transition-all shrink-0"
                          onClick={e => { e.stopPropagation(); handleDelete(doc.document_id); }}
                          title="Delete document"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="flex-shrink-0 p-3 border-t border-[#E2E6EF] bg-[#F7F9FC]">
              {showClearConfirm ? (
                <div className="rounded-xl border border-[#E5001B]/30 bg-[#FEE7E9]/50 p-3 text-[11px] space-y-2">
                  <p className="font-bold text-[#E5001B]">Clear entire frameworks library?</p>
                  <div className="flex gap-1.5">
                    <button
                      className="flex-1 bg-[#E5001B] text-white px-3 py-1.5 rounded-lg font-bold text-[10px] disabled:opacity-50 hover:bg-[#B30015] transition-colors"
                      onClick={handleClearLibrary}
                      disabled={clearingLibrary}
                    >
                      {clearingLibrary ? "Clearing…" : "Yes, clear"}
                    </button>
                    <button
                      className="flex-1 bg-white border border-[#E2E6EF] text-[#5A6478] px-3 py-1.5 rounded-lg font-bold text-[10px] hover:border-[#0C233C] transition-colors"
                      onClick={() => setShowClearConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full inline-flex items-center justify-center gap-1.5 bg-white border border-[#E5001B]/30 text-[#E5001B] px-3 py-2 rounded-xl font-semibold text-[11px] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#FEE7E9]/50 transition-colors"
                  disabled={!frameworkDocs.length}
                  onClick={() => setShowClearConfirm(true)}
                >
                  <Trash2 className="h-3 w-3" /> Clear Library
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Resize divider ── */}
        {leftPanelOpen && (
          <div
            className="w-1 flex-shrink-0 cursor-col-resize hover:bg-[#1E49E2]/30 transition-colors"
            onMouseDown={onDividerMouseDown}
          />
        )}

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F0F2F7]">

          {/* Right panel header — filter strip */}
          <div className="flex-shrink-0 bg-[#F7F9FC] border-b border-[#E2E6EF] px-5 py-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              className="p-1.5 rounded-lg bg-white border border-[#E2E6EF] hover:border-[#0C233C] transition-colors"
              title={leftPanelOpen ? "Hide panel" : "Show panel"}
            >
              {leftPanelOpen ? (
                <PanelLeftClose className="h-4 w-4 text-[#5A6478]" />
              ) : (
                <PanelLeftOpen className="h-4 w-4 text-[#5A6478]" />
              )}
            </button>

            {/* View toggle — rounded pills */}
            <div className="flex items-center gap-1 bg-white border border-[#E2E6EF] rounded-full p-1">
              {[
                { id: "dashboard", label: "Overview" },
                { id: "elements", label: "Elements" },
                { id: "graph", label: "Graph" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  className={`px-4 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                    rightPanelView === id
                      ? "bg-[#00338D] text-white"
                      : "text-[#5A6478] hover:text-[#0C233C]"
                  }`}
                  onClick={() => {
                    setRightPanelView(id as RightPanelView);
                    if (id === "graph" && !graphStats) fetchGraphStats();
                    if (id === "elements" && elementsViewMode === "merged" && !mergedElements) fetchMerged();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sub-mode toggle (only in elements view) */}
            {rightPanelView === "elements" && (
              <div className="flex items-center gap-1 bg-white border border-[#E2E6EF] rounded-full p-1">
                {[
                  { id: "document", label: selectedDoc ? selectedDoc.framework_name : "All" },
                  { id: "merged", label: "Merged" },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors max-w-[200px] truncate ${
                      elementsViewMode === id
                        ? "bg-[#7213EA] text-white"
                        : "text-[#5A6478] hover:text-[#0C233C]"
                    }`}
                    onClick={() => {
                      setElementsViewMode(id as ElementsViewMode);
                      if (id === "merged" && !mergedElements) fetchMerged();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Filter controls (elements view) */}
            {rightPanelView === "elements" && (
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="text"
                  placeholder="Search elements…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-8 text-[12px] w-48 bg-white border border-[#E2E6EF] rounded-lg px-3 text-[#0C233C] placeholder:text-[#8492A6] focus:outline-none focus:border-[#1E49E2] transition-colors"
                />
                <select
                  className="h-8 text-[12px] rounded-lg border border-[#E2E6EF] bg-white px-3 text-[#0C233C] focus:outline-none focus:border-[#1E49E2] transition-colors"
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {allCategories.map(cat => (
                    <option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Right panel content */}
          <ScrollArea className="flex-1">
            {/* ── Hero (scrolls with content) ── */}
            <section
              className="relative overflow-hidden"
              style={{ background: "#0C233C", padding: "44px 0 40px" }}
            >
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 460,
                  height: 460,
                  background: "radial-gradient(circle, rgba(114,19,234,0.3) 0%, transparent 70%)",
                  filter: "blur(80px)",
                  top: -140,
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
                  bottom: -100,
                  left: "5%",
                }}
              />
              <div className="relative max-w-[1400px] mx-auto px-8 md:px-12">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-0.5 rounded bg-[#00338D]" />
                      <span className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase">
                        Knowledge Base
                      </span>
                    </div>
                    <h1
                      className="font-bold text-white leading-tight mb-3"
                      style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-2px" }}
                    >
                      Frameworks Library
                    </h1>
                    <p className="text-[15px] text-white/60 max-w-[640px] leading-[1.7]">
                      Upload quality &amp; risk frameworks — 5W1H, ECOTM, PDCA, FMEA, and more.
                    </p>
                  </div>
                  <button
                    onClick={fetchDocs}
                    title="Refresh"
                    className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/65 bg-white/10 border border-white/20 px-3 py-2 rounded-full hover:bg-white/20 transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" /> Refresh
                  </button>
                </div>
              </div>
            </section>

            {/* ── KPI strip ── */}
            <div className="bg-[#F0F2F7] border-b border-[#E2E6EF]">
              <div className="max-w-[1400px] mx-auto px-8 md:px-12 py-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                {kpiTiles.map(({ label, value, accent, valueColor }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                      style={{ background: accent }}
                    />
                    <div className="font-bold text-[#0C233C] text-[15px] mt-1">{label}</div>
                    <div
                      className="font-bold text-[38px] leading-none tracking-tight mt-3"
                      style={{ color: valueColor }}
                    >
                      {value}
                    </div>
                    <div className="text-[12px] text-[#8492A6] mt-2">
                      {label === "Frameworks Uploaded"
                        ? "documents in library"
                        : label === "Total Elements"
                        ? "extracted elements"
                        : "distinct risk categories"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="max-w-[1400px] mx-auto px-8 md:px-12 py-8">

              {/* Overview */}
              {rightPanelView === "dashboard" && (
                <div className="space-y-8">
                  <div>
                    {/* Section head */}
                    <div className="pb-4 border-b-2 border-[#E2E6EF] mb-5">
                      <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
                        Overview
                      </div>
                      <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">
                        Library Summary
                      </div>
                    </div>

                    {allLoading ? (
                      <p className="text-[13px] text-[#8492A6]">Loading…</p>
                    ) : !frameworkDocs.length ? (
                      <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-12 text-center">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F0F2F7] flex items-center justify-center mb-4">
                          <BookOpen className="h-6 w-6 text-[#8492A6]" />
                        </div>
                        <p className="text-[15px] font-bold text-[#0C233C]">No frameworks uploaded yet</p>
                        <p className="text-[13px] text-[#5A6478] mt-1.5 leading-relaxed">
                          Upload a framework document from the left panel to get started
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {/* Category breakdown */}
                        {allCategories.length > 0 && (
                          <div>
                            <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-3">
                              Elements by Risk Category
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {allCategories.map(cat => {
                                const count = allElements.filter(e => e.risk_category === cat).length;
                                const hue = categoryHue(cat, allCategories);
                                return (
                                  <div
                                    key={cat}
                                    className="flex items-center justify-between bg-white rounded-2xl border border-[#E2E6EF] shadow-sm px-5 py-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
                                    onClick={() => {
                                      setCategoryFilter(cat);
                                      setRightPanelView("elements");
                                      setElementsViewMode("document");
                                    }}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div
                                        className="w-1 h-9 rounded-full flex-shrink-0"
                                        style={{ background: `hsl(${hue},70%,50%)` }}
                                      />
                                      <span className="text-[13px] font-bold text-[#0C233C] truncate">
                                        {cat.replace(/_/g, " ")}
                                      </span>
                                    </div>
                                    <span
                                      className="text-[12px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                                      style={{ background: `hsl(${hue},60%,92%)`, color: `hsl(${hue},60%,35%)` }}
                                    >
                                      {count}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Per-framework breakdown */}
                        <div>
                          <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-3">
                            Uploaded Frameworks
                          </div>
                          <div className="space-y-3">
                            {frameworkDocs.map(doc => (
                              <div
                                key={doc.document_id}
                                className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-5 cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
                                onClick={() => handleDocClick(doc)}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[15px] font-bold text-[#0C233C] truncate">{doc.framework_name}</p>
                                    <p className="text-[12px] text-[#8492A6] mt-1">
                                      {doc.framework_type} · {doc.total_elements} elements
                                    </p>
                                  </div>
                                  <span className="text-[11px] font-bold text-[#1E49E2] bg-[#EEF2FF] px-3 py-1.5 rounded-full shrink-0">
                                    View →
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Elements view */}
              {rightPanelView === "elements" && (
                <div>
                  <div className="pb-4 border-b-2 border-[#E2E6EF] mb-5">
                    <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
                      {elementsViewMode === "merged" ? "Cross-framework" : "Catalogue"}
                    </div>
                    <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">
                      {elementsViewMode === "merged"
                        ? "Merged Elements"
                        : selectedDoc
                        ? selectedDoc.framework_name
                        : "All Elements"}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(elementsViewMode === "merged" ? mergedLoading : allLoading || detailLoading) ? (
                      <p className="text-[13px] text-[#8492A6] py-6 text-center">Loading…</p>
                    ) : !filteredElements.length ? (
                      <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-12 text-center">
                        <p className="text-[13px] text-[#8492A6]">
                          {allElements.length
                            ? "No elements match the current filter."
                            : "No elements extracted yet. Upload a framework document."}
                        </p>
                      </div>
                    ) : (
                      filteredElements.map(elem => (
                        <ElementCard
                          key={elem.element_id}
                          elem={elem}
                          allCategories={allCategories}
                          isMerged={elementsViewMode === "merged"}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Graph stats view */}
              {rightPanelView === "graph" && (
                <div className="space-y-6">
                  <div className="pb-4 border-b-2 border-[#E2E6EF]">
                    <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
                      Graph-RAG
                    </div>
                    <div className="font-bold text-[#0C233C] text-[20px] tracking-tight mb-2">
                      Knowledge Graph
                    </div>
                    <p className="text-[13px] text-[#5A6478] leading-relaxed max-w-[760px]">
                      A knowledge graph is automatically built and saved after each framework document is ingested.
                      It is used for Graph-RAG enriched extraction of subsequent documents.
                    </p>
                  </div>

                  {graphLoading ? (
                    <p className="text-[13px] text-[#8492A6]">Loading graph stats…</p>
                  ) : !graphStats ? (
                    <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-12 text-center">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F0F2F7] flex items-center justify-center mb-4">
                        <Network className="h-6 w-6 text-[#8492A6]" />
                      </div>
                      <p className="text-[15px] font-bold text-[#0C233C]">No graph data loaded yet</p>
                      <button
                        className="mt-4 inline-flex items-center gap-2 bg-[#00338D] text-white px-6 py-2.5 rounded-xl font-bold text-[13px] hover:bg-[#002265] transition-colors"
                        onClick={fetchGraphStats}
                      >
                        Fetch Graph Stats
                      </button>
                    </div>
                  ) : !graphStats.graph_exists ? (
                    <div className="bg-white rounded-2xl border-2 border-dashed border-[#E2E6EF] p-12 text-center">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F0F2F7] flex items-center justify-center mb-3">
                        <Network className="h-5 w-5 text-[#8492A6]" />
                      </div>
                      <p className="text-[15px] font-bold text-[#0C233C]">No graph saved yet</p>
                      <p className="text-[13px] text-[#5A6478] mt-1.5 leading-relaxed">
                        Upload a framework document to generate the knowledge graph.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {graphStats.last_updated && (
                        <p className="text-[12px] text-[#8492A6]">
                          Last updated: {new Date(graphStats.last_updated).toLocaleString()}
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {Object.entries(graphStats.stats).map(([key, val], idx) => {
                          const accents = ["#098E7E", "#1E49E2", "#7213EA", "#EAAA00", "#00B8F5", "#E5001B"];
                          const accent = accents[idx % accents.length];
                          return (
                            <div
                              key={key}
                              className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm p-7 relative transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                            >
                              <div
                                className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                                style={{ background: accent }}
                              />
                              <div
                                className="font-bold text-[38px] leading-none tracking-tight mt-1"
                                style={{ color: accent }}
                              >
                                {val}
                              </div>
                              <div className="text-[12px] text-[#8492A6] mt-2">{key.replace(/_/g, " ")}</div>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        className="inline-flex items-center gap-2 bg-white border border-[#E2E6EF] text-[#0C233C] px-5 py-2.5 rounded-xl font-bold text-[13px] hover:border-[#0C233C] transition-colors"
                        onClick={fetchGraphStats}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Refresh
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
