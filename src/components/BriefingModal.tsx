"use client";

import { useEffect, useState, useRef } from "react";
import { X, Loader2, RefreshCw, BookOpen } from "lucide-react";

type TabId = "A" | "B" | "C" | "D" | "consensus";

const TABS: { id: TabId; label: string }[] = [
  { id: "A", label: "Bot A" },
  { id: "B", label: "Bot B" },
  { id: "C", label: "Bot C" },
  { id: "D", label: "Bot D" },
  { id: "consensus", label: "Consensus" },
];

interface BriefingModalProps {
  onClose: () => void;
}

/** Render markdown-ish text: ## headings, **bold**, bullet lists */
function BriefingContent({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="text-xs font-semibold uppercase tracking-wider text-accent mt-5 mb-2 first:mt-0">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="text-sm font-bold text-text mt-4 mb-2 first:mt-0">
          {line.slice(2)}
        </h2>
      );
    } else if (line.startsWith("• ") || line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2 text-xs text-text/90 leading-relaxed my-0.5">
          <span className="text-accent mt-0.5 flex-shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: inlineMd(line.slice(2)) }} />
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-xs text-text/90 leading-relaxed">
          <span dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />
        </p>
      );
    }
  }
  return <div className="space-y-0.5">{elements}</div>;
}

function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong class='text-text font-semibold'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em class='text-muted italic'>$1</em>");
}

export default function BriefingModal({ onClose }: BriefingModalProps) {
  const [tab, setTab] = useState<TabId>("A");
  const [briefings, setBriefings] = useState<Partial<Record<TabId, string>>>({});
  const [loadingBots, setLoadingBots] = useState<Set<TabId>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [activeBots, setActiveBots] = useState<TabId[]>([]);
  const [error, setError] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // On mount: try to load stored briefing for today first
  useEffect(() => {
    loadStoredBriefing();
    return () => abortRef.current?.abort();
  }, []);

  async function loadStoredBriefing() {
    try {
      const res = await fetch("/api/briefing");
      const data = await res.json();
      if (data.briefings && Object.keys(data.briefings).length > 0) {
        const loaded: Partial<Record<TabId, string>> = {};
        for (const [bot, info] of Object.entries(data.briefings)) {
          loaded[bot as TabId] = (info as any).content;
        }
        setBriefings(loaded);
        const bots = Object.keys(loaded).filter(k => k !== "consensus") as TabId[];
        setActiveBots(bots.length > 0 ? bots : ["A"]);
        const times = Object.values(data.briefings).map((b: any) => b.createdAt).filter(Boolean);
        if (times.length > 0) setLastGenerated(times[0]);
      }
    } catch { /* ignore — will generate fresh */ }
  }

  async function generate() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setGenerating(true);
    setError("");
    setBriefings({});
    setLoadingBots(new Set());

    try {
      const res = await fetch("/api/briefing", { method: "POST", signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            handleEvent(evt);
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleEvent(evt: any) {
    switch (evt.type) {
      case "start":
        setActiveBots(evt.activeBots ?? ["A"]);
        setLoadingBots(new Set(evt.activeBots ?? ["A"]));
        break;
      case "bot_start":
        setLoadingBots(prev => new Set([...prev, evt.bot]));
        // Switch to the first bot that starts
        setTab(prev => prev === "A" && evt.bot !== "A" ? evt.bot : prev);
        break;
      case "bot_done":
        setBriefings(prev => ({ ...prev, [evt.bot]: evt.content }));
        setLoadingBots(prev => { const s = new Set(prev); s.delete(evt.bot); return s; });
        break;
      case "consensus_start":
        setLoadingBots(prev => new Set([...prev, "consensus"]));
        break;
      case "consensus_done":
        setBriefings(prev => ({ ...prev, consensus: evt.content }));
        setLoadingBots(prev => { const s = new Set(prev); s.delete("consensus"); return s; });
        setLastGenerated(new Date().toISOString());
        break;
      case "error":
        setError(evt.message ?? "Unknown error");
        break;
    }
  }

  const visibleTabs = activeBots.length > 0
    ? TABS.filter(t => t.id === "consensus" || activeBots.includes(t.id))
    : TABS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card w-full max-w-2xl h-[85vh] flex flex-col relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-accent" />
            <h2 className="text-xs font-semibold uppercase tracking-wider">Daily Intelligence Briefing</h2>
          </div>
          <div className="flex items-center gap-2">
            {lastGenerated && (
              <span className="text-[10px] text-muted">
                {new Date(lastGenerated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            )}
            <button
              onClick={generate}
              disabled={generating}
              title="Generate new briefing"
              className="flex items-center gap-1 text-[10px] text-muted hover:text-accent px-2 py-1 rounded border border-border hover:border-accent/30 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={10} className={generating ? "animate-spin" : ""} />
              {generating ? "Generating…" : Object.keys(briefings).length === 0 ? "Generate" : "Regenerate"}
            </button>
            <button onClick={onClose} className="text-muted hover:text-text">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3 flex-shrink-0 overflow-x-auto">
          {visibleTabs.map(t => {
            const isLoading = loadingBots.has(t.id);
            const hasContent = Boolean(briefings[t.id]);
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? "bg-accent/20 text-accent border border-accent/30"
                    : "text-muted hover:text-text border border-transparent hover:border-border"
                }`}
              >
                {isLoading && <Loader2 size={9} className="animate-spin" />}
                {!isLoading && hasContent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                )}
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {error && (
            <p className="text-xs text-danger mb-3">{error}</p>
          )}

          {loadingBots.has(tab) && (
            <div className="flex items-center gap-2 text-xs text-muted py-12 justify-center">
              <Loader2 size={14} className="animate-spin text-accent" />
              Generating {TABS.find(t => t.id === tab)?.label} briefing…
            </div>
          )}

          {!loadingBots.has(tab) && !briefings[tab] && !generating && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <BookOpen size={32} className="text-muted/40" />
              <p className="text-xs text-muted text-center">
                No briefing yet for today.<br />
                Click <strong className="text-text">Generate</strong> to create one.
              </p>
            </div>
          )}

          {!loadingBots.has(tab) && !briefings[tab] && generating && (
            <div className="flex items-center gap-2 text-xs text-muted py-12 justify-center">
              <Loader2 size={14} className="animate-spin text-accent" />
              Waiting for {TABS.find(t => t.id === tab)?.label}…
            </div>
          )}

          {briefings[tab] && (
            <div className="pr-1">
              <BriefingContent text={briefings[tab]!} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
