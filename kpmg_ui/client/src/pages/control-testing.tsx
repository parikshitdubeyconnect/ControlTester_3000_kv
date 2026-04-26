import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  FileWarning,
  Loader2,
  Play,
  RotateCcw,
  Shield,
  Upload,
  X,
} from "lucide-react";

import ControlTestingKpis from "@/components/ControlTestingKpis";
import HowItWorks from "@/components/HowItWorks";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { useControlTesting } from "@/contexts/ControlTestingContext";
import {
  canGenerateWorkpaper,
  CONTROL_TESTING_API,
} from "@/pages/control-testing.helpers";

const CHECKLIST_PAGE_SIZE = 5;

// ─── Brand-aligned primitives ────────────────────────────────────────────────
const PANEL =
  "bg-white rounded-2xl border border-[#E2E6EF] shadow-sm";
const PANEL_PAD = "p-6";

const PRIMARY_BTN =
  "inline-flex items-center justify-center gap-2 bg-[#00338D] text-white px-6 py-3 rounded-xl font-bold text-[14px] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#002a73] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0";
const SECONDARY_BTN =
  "inline-flex items-center justify-center gap-2 bg-white border border-[#E2E6EF] text-[#0C233C] px-6 py-3 rounded-xl font-bold text-[14px] transition-all duration-200 hover:border-[#0C233C]/40 disabled:opacity-60 disabled:cursor-not-allowed";
const GHOST_ICON_BTN =
  "inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E6EF] bg-white text-[#5A6478] hover:text-[#0C233C] hover:border-[#0C233C]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "navy" | "success" | "warn" | "danger" | "mono";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-[#F0F2F7] text-[#5A6478] border-[#E2E6EF]",
    navy: "bg-[#EEF2FF] text-[#00338D] border-[#D5DEF7]",
    success: "bg-[#E6F5EC] text-[#067A37] border-[#B7E0C5]",
    warn: "bg-[#FFF6E0] text-[#8A6500] border-[#F2DA88]",
    danger: "bg-[#FCE6E9] text-[#B30016] border-[#F2B7BF]",
    mono: "bg-white text-[#0C233C] border-[#E2E6EF] font-mono",
  };
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function SectionHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 pb-4 border-b-2 border-[#E2E6EF] mb-5">
      <div>
        <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
          {eyebrow}
        </div>
        <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">
          {title}
        </div>
      </div>
      {right}
    </div>
  );
}

export default function ControlTestingPage() {
  const { toast } = useToast();
  const [checklistPage, setChecklistPage] = useState(0);
  const {
    sessionId,
    currentStep,
    testScriptFile,
    controlsFound,
    evidenceChecklist,
    warnings,
    evidenceFiles,
    filesProcessed,
    evidenceSummary,
    appendFilesProcessed,
    pendingControls,
    readyToGenerate,
    isProcessing,
    workpaperFilename,
    downloadUrl,
    workpaperSummary,
    resultMessage,
    error,
    setTestScriptFile,
    setSessionData,
    addEvidenceFiles,
    setEvidenceFiles,
    resetState,
  } = useControlTesting();

  const onDropScript = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      const file = acceptedFiles[0];
      setTestScriptFile(file);
      toast({
        title: "Test script ready",
        description: `${file.name} is ready for parsing.`,
      });
    },
    [setTestScriptFile, toast],
  );

  const onDropEvidence = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      addEvidenceFiles(acceptedFiles);
      toast({
        title: "Evidence files added",
        description: `${acceptedFiles.length} file(s) queued for validation.`,
      });
    },
    [addEvidenceFiles, toast],
  );

  const {
    getRootProps: getScriptRootProps,
    getInputProps: getScriptInputProps,
    isDragActive: isScriptDragActive,
  } = useDropzone({
    onDrop: onDropScript,
    multiple: false,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
    },
  });

  const {
    getRootProps: getEvidenceRootProps,
    getInputProps: getEvidenceInputProps,
    isDragActive: isEvidenceDragActive,
  } = useDropzone({
    onDrop: onDropEvidence,
    multiple: true,
  });

  const removeEvidenceFile = (index: number) => {
    setEvidenceFiles(evidenceFiles.filter((_, fileIndex) => fileIndex !== index));
  };

  const handleStartAudit = async () => {
    if (!testScriptFile) {
      toast({
        title: "No test script selected",
        description: "Upload the Excel test script first.",
        variant: "destructive",
      });
      return;
    }

    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setSessionData({ isProcessing: true, error: null });

    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      formData.append("test_script", testScriptFile);

      const response = await fetch(CONTROL_TESTING_API.start, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errData.error || errData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setChecklistPage(0);
      setSessionData({
        sessionId: data.session_id,
        currentStep: "review_checklist",
        controlsFound: data.controls_found,
        evidenceChecklist: data.evidence_checklist || [],
        warnings: data.warnings || [],
        filesProcessed: [],
        evidenceSummary: null,
        pendingControls: data.evidence_checklist || [],
        readyToGenerate: false,
        isProcessing: false,
      });

      toast({
        title: "Test script parsed",
        description: `${data.controls_found} control(s) found. Review the checklist and upload evidence.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to parse the test script";
      setSessionData({ isProcessing: false, error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleUploadEvidence = async () => {
    if (evidenceFiles.length === 0) {
      toast({
        title: "No evidence selected",
        description: "Upload one or more evidence files first.",
        variant: "destructive",
      });
      return;
    }

    if (!sessionId) {
      return;
    }

    setSessionData({ isProcessing: true, error: null });

    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      evidenceFiles.forEach((file) => {
        formData.append("evidence_files", file);
      });

      const response = await fetch(CONTROL_TESTING_API.uploadEvidence, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errData.error || errData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();
      appendFilesProcessed(data.files_processed || []);
      setSessionData({
        currentStep: "upload_evidence",
        evidenceSummary: data.evidence_summary || null,
        pendingControls: data.pending_controls || [],
        readyToGenerate: data.ready_to_generate || false,
        isProcessing: false,
        evidenceFiles: [],
      });

      const accepted = (data.files_processed || []).filter(
        (file: { validation_status: string }) => file.validation_status === "accepted",
      ).length;
      const rejected = (data.files_processed || []).filter(
        (file: { validation_status: string }) => file.validation_status === "rejected",
      ).length;

      toast({
        title: "Evidence validated",
        description: `${accepted} accepted, ${rejected} rejected.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to validate evidence";
      setSessionData({ isProcessing: false, error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleGenerateWorkpaper = async () => {
    if (!sessionId) {
      return;
    }

    setSessionData({ isProcessing: true, currentStep: "generating", error: null });

    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      if (!readyToGenerate) {
        formData.append("force_generate", "true");
      }

      const response = await fetch(CONTROL_TESTING_API.generateWorkpaper, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errData.error || errData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setSessionData({
        currentStep: "results",
        workpaperFilename: data.workpaper_filename || null,
        downloadUrl: data.download_url || null,
        workpaperSummary: data.summary || null,
        resultMessage: data.message || "Workpaper generated successfully",
        isProcessing: false,
      });

      toast({
        title: "Workpaper generated",
        description: data.message || "The workpaper is ready for download.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate workpaper";
      setSessionData({ isProcessing: false, currentStep: "upload_evidence", error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleDownloadWorkpaper = async () => {
    if (!downloadUrl) {
      return;
    }

    try {
      const response = await fetch(`/api${downloadUrl}`);
      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = workpaperFilename || "workpaper.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "The workpaper has been saved." });
    } catch {
      toast({
        title: "Error",
        description: "Failed to download the workpaper.",
        variant: "destructive",
      });
    }
  };

  const handleNewAudit = () => {
    resetState();
    setChecklistPage(0);
    toast({ title: "Ready", description: "You can start a new control test." });
  };

  // The duplicate stepper-pill row was removed; current step is now reflected
  // by which section is rendered, not by a numbered indicator.
  const showGenerateAction = canGenerateWorkpaper(readyToGenerate, evidenceSummary);

  const overallResult = workpaperSummary?.overall_result ?? "";
  const resultTone =
    overallResult === "COMPLIANT"
      ? "success"
      : overallResult === "NON_COMPLIANT"
        ? "danger"
        : "warn";

  return (
    <div className="h-full flex flex-col bg-[#F0F2F7]">
      {/* ── Main (scrollable). TraceNavBar comes from AppLayout. ── */}
      <main className="flex-1 overflow-auto">
        {/* ── Hero ── */}
        <section
          className="relative overflow-hidden"
          style={{ background: "#0C233C", padding: "52px 0 56px" }}
        >
          {/* Orbs */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 460,
              height: 460,
              background:
                "radial-gradient(circle, rgba(114,19,234,0.3) 0%, transparent 70%)",
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
              background:
                "radial-gradient(circle, rgba(0,184,245,0.18) 0%, transparent 70%)",
              filter: "blur(80px)",
              bottom: -100,
              left: "5%",
            }}
          />
          <div className="relative max-w-[1100px] mx-auto px-8 md:px-12">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-4 h-0.5 rounded bg-[#00338D]" />
              <span className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase">
                Audit Automation
              </span>
            </div>
            <h1
              className="font-bold text-white leading-tight mb-4"
              style={{ fontSize: "clamp(32px, 5vw, 52px)", letterSpacing: "-2px" }}
            >
              Control Testing
            </h1>
            <p className="text-[16px] text-white/60 max-w-[640px] leading-[1.75]">
              Upload a test script, validate evidence against required controls, and
              generate an audit workpaper — all in a single guided flow.
            </p>
          </div>
        </section>

        <div className="max-w-[1100px] mx-auto px-8 md:px-12 py-12 pb-24 space-y-8">
          <HowItWorks
            defaultOpen
            steps={[
              {
                number: 1,
                title: "Upload Test Script",
                desc: "Upload the control test script (CSV / XLSX) defining the controls in scope and the evidence required for each test step.",
                color: "#7213EA",
              },
              {
                number: 2,
                title: "Validate Evidence",
                desc: "APEX validates uploaded evidence against required controls, checks completeness, and flags gaps before workpaper generation.",
                color: "#1E49E2",
              },
              {
                number: 3,
                title: "Generate Workpaper",
                desc: "Review the validation summary and generate a structured audit workpaper ready for download and reporting.",
                color: "#098E7E",
              },
            ]}
          />

          {error && (
            <div
              className={`${PANEL} ${PANEL_PAD} flex items-start gap-3`}
              style={{ borderColor: "#E5001B" }}
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-[#E5001B] mt-0.5" />
              <div>
                <p className="text-[14px] font-bold text-[#0C233C]">Something went wrong</p>
                <p className="text-[13px] text-[#5A6478] mt-1">{error}</p>
              </div>
            </div>
          )}

          {currentStep === "upload_script" && (
            <section className={`${PANEL} ${PANEL_PAD}`}>
              <SectionHeader
                eyebrow="Step 1"
                title="Upload Test Script"
              />
              <p className="text-[14px] text-[#5A6478] leading-relaxed mb-5">
                Upload the Excel test script that defines the controls, test steps,
                and expected evidence.
              </p>

              <div
                {...getScriptRootProps()}
                className={`rounded-2xl p-8 text-center cursor-pointer transition-colors border-2 border-dashed ${
                  isScriptDragActive
                    ? "border-[#00338D] bg-[#EEF2FF]"
                    : "border-[#E2E6EF] hover:border-[#00338D]/60 bg-[#F8FAFD]"
                }`}
                data-testid="dropzone-script"
              >
                <input {...getScriptInputProps()} data-testid="input-script-file" />
                <Upload className="h-10 w-10 mx-auto text-[#8492A6] mb-3" />
                {isScriptDragActive ? (
                  <p className="text-[#00338D] font-bold text-[14px]">
                    Drop the test script here…
                  </p>
                ) : (
                  <>
                    <p className="text-[#0C233C] font-bold text-[14px]">
                      Drag and drop the Excel test script here
                    </p>
                    <p className="text-[#8492A6] text-[12px] mt-1">
                      or click to browse (.xlsx, .xlsm)
                    </p>
                  </>
                )}
              </div>

              {testScriptFile && (
                <div className="flex items-center justify-between gap-3 p-3 mt-4 bg-[#F0F2F7] rounded-xl border border-[#E2E6EF]">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileSpreadsheet className="h-4 w-4 text-[#00338D] flex-shrink-0" />
                    <span className="text-[13px] text-[#0C233C] truncate max-w-xs">
                      {testScriptFile.name}
                    </span>
                    <Pill tone="neutral">
                      {(testScriptFile.size / 1024).toFixed(1)} KB
                    </Pill>
                  </div>
                  <button
                    onClick={() => setTestScriptFile(null)}
                    className={GHOST_ICON_BTN}
                    data-testid="button-remove-script"
                    aria-label="Remove test script"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <button
                onClick={handleStartAudit}
                disabled={!testScriptFile || isProcessing}
                className={`${PRIMARY_BTN} w-full mt-5`}
                data-testid="button-start-audit"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Parsing Test Script…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" fill="white" />
                    Parse Test Script
                  </>
                )}
              </button>
            </section>
          )}

          {(currentStep === "review_checklist" || currentStep === "upload_evidence") && (
            <>
              {warnings.length > 0 && (
                <div
                  className={`${PANEL} ${PANEL_PAD}`}
                  style={{ borderColor: "#EAAA00" }}
                >
                  <div className="flex items-start gap-3">
                    <FileWarning className="h-5 w-5 text-[#EAAA00] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-[#0C233C]">
                        Test script warnings
                      </p>
                      <ul className="mt-2 space-y-1">
                        {warnings.map((warning, index) => (
                          <li key={index} className="text-[13px] text-[#5A6478]">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <section className={`${PANEL} ${PANEL_PAD}`}>
                <SectionHeader
                  eyebrow="Evidence"
                  title="Evidence Checklist"
                  right={
                    <Pill tone="navy">
                      {controlsFound} control(s)
                    </Pill>
                  }
                />
                <p className="text-[14px] text-[#5A6478] leading-relaxed mb-5">
                  Review the evidence required for each parsed control, then submit
                  the supporting files.
                </p>

                <div className="space-y-2">
                  {evidenceChecklist
                    .slice(
                      checklistPage * CHECKLIST_PAGE_SIZE,
                      (checklistPage + 1) * CHECKLIST_PAGE_SIZE,
                    )
                    .map((item, index) => {
                      const isSatisfied = filesProcessed.some(
                        (file) =>
                          file.validation_status === "accepted" &&
                          file.satisfies_controls?.includes(item.control_id),
                      );

                      return (
                        <div
                          key={item.control_id}
                          className="flex items-start gap-3 p-4 rounded-xl bg-[#F8FAFD] border border-[#E2E6EF]"
                          data-testid={`checklist-item-${
                            checklistPage * CHECKLIST_PAGE_SIZE + index
                          }`}
                        >
                          <div className="mt-0.5">
                            {isSatisfied ? (
                              <CheckCircle2 className="h-5 w-5 text-[#009A44]" />
                            ) : (
                              <Clock className="h-5 w-5 text-[#8492A6]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Pill tone="mono">{item.control_id}</Pill>
                              <Pill tone={isSatisfied ? "success" : "neutral"}>
                                {isSatisfied ? "Received" : "Pending"}
                              </Pill>
                            </div>
                            <p className="text-[13px] mt-2 text-[#5A6478] truncate">
                              {item.control_description}
                            </p>
                            <p className="text-[12px] mt-1 text-[#00338D]">
                              Required evidence: {item.evidence_required}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {evidenceChecklist.length > CHECKLIST_PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#E2E6EF]">
                    <p className="text-[12px] text-[#8492A6]">
                      Showing {checklistPage * CHECKLIST_PAGE_SIZE + 1}-
                      {Math.min(
                        (checklistPage + 1) * CHECKLIST_PAGE_SIZE,
                        evidenceChecklist.length,
                      )}{" "}
                      of {evidenceChecklist.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        className={GHOST_ICON_BTN}
                        disabled={checklistPage === 0}
                        onClick={() => setChecklistPage((page) => page - 1)}
                        data-testid="button-checklist-prev"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-[12px] px-2 text-[#5A6478] font-semibold">
                        {checklistPage + 1} /{" "}
                        {Math.ceil(evidenceChecklist.length / CHECKLIST_PAGE_SIZE)}
                      </span>
                      <button
                        className={GHOST_ICON_BTN}
                        disabled={
                          (checklistPage + 1) * CHECKLIST_PAGE_SIZE >=
                          evidenceChecklist.length
                        }
                        onClick={() => setChecklistPage((page) => page + 1)}
                        data-testid="button-checklist-next"
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {filesProcessed.length > 0 && (
                <section className={`${PANEL} ${PANEL_PAD}`}>
                  <SectionHeader
                    eyebrow="Validation"
                    title="Evidence Validation Results"
                    right={
                      evidenceSummary ? (
                        <Pill tone="navy">
                          {evidenceSummary.received}/{evidenceSummary.total_controls} received
                        </Pill>
                      ) : undefined
                    }
                  />
                  <div className="space-y-2">
                    {filesProcessed.map((file, index) => {
                      const accepted = file.validation_status === "accepted";
                      return (
                        <div
                          key={`${file.filename}-${index}`}
                          className="flex items-start gap-3 p-4 rounded-xl border"
                          style={{
                            background: accepted ? "#F1FAF4" : "#FDF1F3",
                            borderColor: accepted ? "#B7E0C5" : "#F2B7BF",
                          }}
                          data-testid={`validation-result-${index}`}
                        >
                          {accepted ? (
                            <CheckCircle2 className="h-5 w-5 text-[#009A44] flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-[#E5001B] flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-bold text-[#0C233C] truncate">
                                {file.filename}
                              </span>
                              <Pill tone={accepted ? "success" : "danger"}>
                                {file.validation_status}
                              </Pill>
                            </div>
                            <p className="text-[12px] text-[#5A6478] mt-1">
                              {file.reason}
                            </p>
                            {file.satisfies_controls &&
                              file.satisfies_controls.length > 0 && (
                                <div className="flex items-center gap-1 mt-2 flex-wrap">
                                  <span className="text-[12px] text-[#8492A6]">
                                    Tagged controls:
                                  </span>
                                  {file.satisfies_controls.map((controlId) => (
                                    <Pill key={controlId} tone="mono">
                                      {controlId}
                                    </Pill>
                                  ))}
                                </div>
                              )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className={`${PANEL} ${PANEL_PAD}`}>
                <SectionHeader
                  eyebrow="Step 2"
                  title="Upload Evidence Files"
                />
                <p className="text-[14px] text-[#5A6478] leading-relaxed mb-5">
                  Submit the evidence files required by the checklist. Each file is
                  validated and mapped to the relevant controls.
                </p>

                <div
                  {...getEvidenceRootProps()}
                  className={`rounded-2xl p-8 text-center cursor-pointer transition-colors border-2 border-dashed ${
                    isEvidenceDragActive
                      ? "border-[#00338D] bg-[#EEF2FF]"
                      : "border-[#E2E6EF] hover:border-[#00338D]/60 bg-[#F8FAFD]"
                  }`}
                  data-testid="dropzone-evidence"
                >
                  <input
                    {...getEvidenceInputProps()}
                    data-testid="input-evidence-files"
                  />
                  <Upload className="h-10 w-10 mx-auto text-[#8492A6] mb-3" />
                  {isEvidenceDragActive ? (
                    <p className="text-[#00338D] font-bold text-[14px]">
                      Drop the evidence files here…
                    </p>
                  ) : (
                    <>
                      <p className="text-[#0C233C] font-bold text-[14px]">
                        Drag and drop the evidence files here
                      </p>
                      <p className="text-[#8492A6] text-[12px] mt-1">
                        or click to browse (PDF, DOCX, XLSX, CSV, TXT, images)
                      </p>
                    </>
                  )}
                </div>

                {evidenceFiles.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <p className="text-[12px] font-bold text-[#0C233C] uppercase tracking-[1.5px]">
                      Files queued for submission ({evidenceFiles.length})
                    </p>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {evidenceFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-3 p-3 bg-[#F0F2F7] rounded-xl border border-[#E2E6EF]"
                          data-testid={`evidence-file-${index}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-[#00338D] flex-shrink-0" />
                            <span className="text-[13px] text-[#0C233C] truncate max-w-xs">
                              {file.name}
                            </span>
                            <Pill tone="neutral">
                              {(file.size / 1024).toFixed(1)} KB
                            </Pill>
                          </div>
                          <button
                            className={GHOST_ICON_BTN}
                            onClick={() => removeEvidenceFile(index)}
                            data-testid={`button-remove-evidence-${index}`}
                            aria-label="Remove file"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap mt-5">
                  <button
                    onClick={handleUploadEvidence}
                    disabled={evidenceFiles.length === 0 || isProcessing}
                    className={PRIMARY_BTN}
                    data-testid="button-upload-evidence"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Validating Evidence…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Submit Evidence
                      </>
                    )}
                  </button>

                  {showGenerateAction && (
                    <button
                      onClick={handleGenerateWorkpaper}
                      className={readyToGenerate ? PRIMARY_BTN : SECONDARY_BTN}
                      data-testid={
                        readyToGenerate
                          ? "button-generate-workpaper"
                          : "button-force-generate"
                      }
                    >
                      <Play
                        className="h-4 w-4"
                        fill={readyToGenerate ? "white" : "currentColor"}
                      />
                      {readyToGenerate
                        ? "Generate Workpaper"
                        : "Generate with Partial Evidence"}
                    </button>
                  )}
                </div>

                {pendingControls.length > 0 && !readyToGenerate && (
                  <div className="mt-5 p-4 bg-[#F8FAFD] rounded-xl border border-[#E2E6EF]">
                    <p className="text-[13px] font-bold text-[#0C233C] mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#8492A6]" />
                      Outstanding Evidence ({pendingControls.length})
                    </p>
                    <div className="space-y-1.5">
                      {pendingControls.map((control) => (
                        <div
                          key={control.control_id}
                          className="flex items-center gap-2 text-[13px] text-[#5A6478]"
                        >
                          <Pill tone="mono">{control.control_id}</Pill>
                          <span className="truncate">
                            {control.evidence_required ||
                              control.control_description ||
                              ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {currentStep === "generating" && (
            <section className={`${PANEL} p-12`}>
              <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-[#7213EA]" />
                <p className="text-[18px] font-bold text-[#0C233C]">
                  Generating Audit Workpaper…
                </p>
                <p className="text-[14px] text-[#5A6478] text-center max-w-md leading-relaxed">
                  The platform is validating control outcomes and preparing the
                  workpaper. This can take a few minutes.
                </p>
              </div>
            </section>
          )}

          {currentStep === "results" && (
            <>
              <section className={`${PANEL} p-7`}>
                <SectionHeader
                  eyebrow="Output"
                  title="Control Testing Complete"
                  right={
                    workpaperSummary ? (
                      <Pill tone={resultTone}>
                        {(workpaperSummary.overall_result ?? "").replace(/_/g, " ")}
                      </Pill>
                    ) : undefined
                  }
                />
                {resultMessage && (
                  <p className="text-[14px] text-[#5A6478] leading-relaxed mb-5">
                    {resultMessage}
                  </p>
                )}

                {workpaperSummary && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 text-[13px] text-[#8492A6]">
                      <CheckCircle2 className="h-4 w-4 text-[#009A44]" />
                      <span>
                        {workpaperSummary.controls_tested} control(s) tested
                      </span>
                    </div>

                    <ControlTestingKpis
                      controlsTested={workpaperSummary.controls_tested}
                      issuesIdentified={
                        workpaperSummary.fail_count + workpaperSummary.partial_count
                      }
                      severityCounts={workpaperSummary.severity_counts}
                    />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        {
                          val: workpaperSummary.pass_count,
                          label: "Pass",
                          color: "#009A44",
                          bg: "#E6F5EC",
                        },
                        {
                          val: workpaperSummary.fail_count,
                          label: "Fail",
                          color: "#E5001B",
                          bg: "#FCE6E9",
                        },
                        {
                          val: workpaperSummary.partial_count,
                          label: "Partial",
                          color: "#EAAA00",
                          bg: "#FFF6E0",
                        },
                        {
                          val: workpaperSummary.controls_with_evidence,
                          label: "With Evidence",
                          color: "#1E49E2",
                          bg: "#EEF2FF",
                        },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-2xl border border-[#E2E6EF] shadow-sm p-5 relative transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                          style={{ background: stat.bg }}
                        >
                          <div
                            className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                            style={{ background: stat.color }}
                          />
                          <p
                            className="font-bold text-[32px] leading-none tracking-tight mt-1"
                            style={{ color: stat.color }}
                          >
                            {stat.val}
                          </p>
                          <p className="text-[11px] text-[#5A6478] mt-2 uppercase tracking-[1.5px] font-bold">
                            {stat.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {downloadUrl && (
                  <button
                    onClick={handleDownloadWorkpaper}
                    className={`${PRIMARY_BTN} w-full mt-6`}
                    data-testid="button-download-workpaper"
                  >
                    <Download className="h-4 w-4" />
                    Download Workpaper
                  </button>
                )}
              </section>

              <div className="flex items-center justify-center">
                <button
                  className={SECONDARY_BTN}
                  onClick={handleNewAudit}
                  data-testid="button-new-audit"
                >
                  <RotateCcw className="h-4 w-4" />
                  New Audit
                </button>
              </div>
            </>
          )}
        </div>
        <Footer />
      </main>
    </div>
  );
}
