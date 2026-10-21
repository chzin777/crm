"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useContext,
  createContext,
  useEffect,
} from "react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import {
  X,
  Plus,
  ChevronRight,
  ChevronLeft,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface Tab {
  id: string;
  activeNavId: string;
}

export interface SidebarWithTabsProps {
  logo?: React.ReactNode;
  companyName?: string;
  navItems: NavItem[];
  renderContent: (navId: string) => React.ReactNode;
  defaultNavId?: string;
  footer?: React.ReactNode;
}

/* ─── Context ─── */
interface TabsContextValue {
  tabs: Tab[];
  activeTabId: string;
  activeNavId: string;
  setActiveNav: (navId: string) => void;
  addTab: (navId?: string) => void;
  closeTab: (tabId: string) => void;
  closeOthers: (tabId: string) => void;
  closeToRight: (tabId: string) => void;
  closeToLeft: (tabId: string) => void;
  closeAll: () => void;
  setActiveTab: (tabId: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("useTabs must be used within SidebarWithTabs");
  return context;
}

/* ─── ChromeTab ─── */
function ChromeTab({
  tab,
  isActive,
  canClose,
  navItems,
  onTabClick,
  onTabClose,
  onCloseOthers,
  onCloseToRight,
  onCloseToLeft,
  hasOtherTabs,
  hasTabsToRight,
  hasTabsToLeft,
}: {
  tab: Tab;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  canClose: boolean;
  navItems: NavItem[];
  hasRightNeighborActive: boolean;
  onTabClick: () => void;
  onTabClose: () => void;
  onCloseOthers: () => void;
  onCloseToRight: () => void;
  onCloseToLeft: () => void;
  hasOtherTabs: boolean;
  hasTabsToRight: boolean;
  hasTabsToLeft: boolean;
}) {
  const nav = navItems.find((n) => n.id === tab.activeNavId);
  const Icon = nav?.icon;
  const label = nav?.label || "Nova Aba";
  const tabRef = useRef<HTMLDivElement>(null);
  const [ctxOpen, setCtxOpen] = useState(false);

  useEffect(() => {
    if (isActive && tabRef.current) {
      tabRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [isActive]);

  const handleAuxClick = (e: React.MouseEvent) => {
    if (e.button === 1 && canClose) { e.preventDefault(); onTabClose(); }
  };

  return (
    <div className="relative">
      <div
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        className={cn(
          "relative flex items-center gap-2 px-4 py-2.5 ml-[10px] sm:ml-0 text-sm cursor-pointer transition-all duration-200 min-w-[140px] max-w-[220px] outline-none rounded-t-xl select-none",
          isActive
            ? "text-[#051647] bg-white z-10 border-t-2 border-x border-[#C4D600]/40 border-b-0 shadow-[0_-4px_12px_-2px_rgba(196,214,0,0.6),0_-2px_6px_-1px_rgba(196,214,0,0.4),inset_0_1px_8px_-3px_rgba(196,214,0,0.35)]"
            : "text-gray-500 hover:text-[#051647] hover:bg-white/80 border-t-2 border-x border-transparent border-b-0 hover:shadow-[0_-2px_8px_-2px_rgba(196,214,0,0.3)]"
        )}
        onClick={onTabClick}
        onAuxClick={handleAuxClick}
        onContextMenu={(e) => { e.preventDefault(); setCtxOpen(true); }}
        ref={tabRef}
      >
        {isActive && (
          <motion.div
            className="absolute inset-0 bg-white rounded-t-xl"
            layoutId="activeTabBg"
            transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
          >
            <div className="absolute -left-3 bottom-0 w-3 h-3 overflow-hidden">
              <div className="absolute right-0 bottom-0 w-6 h-6 bg-[#f9fafb] rounded-full z-[1]" />
              <div className="absolute inset-0 bg-white" />
            </div>
            <div className="absolute -right-3 bottom-0 w-3 h-3 overflow-hidden">
              <div className="absolute left-0 bottom-0 w-6 h-6 bg-[#f9fafb] rounded-full z-[1]" />
              <div className="absolute inset-0 bg-white" />
            </div>
          </motion.div>
        )}
        <div className="relative flex items-center gap-2 flex-1 min-w-0">
          {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
          <span className="truncate flex-1 font-medium select-none">{label}</span>
          {canClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onTabClose(); }}
              className={cn(
                "flex h-5 w-5 cursor-pointer items-center justify-center rounded-full transition-colors flex-shrink-0",
                isActive
                  ? "hover:bg-gray-100 text-gray-400 hover:text-[#051647]"
                  : "opacity-0 group-hover:opacity-100 hover:bg-gray-200 text-gray-400 hover:text-[#051647]"
              )}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Custom Context Menu */}
      {ctxOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
            <button onClick={() => { onTabClose(); setCtxOpen(false); }} disabled={!canClose}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              Fechar Aba
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button onClick={() => { onCloseOthers(); setCtxOpen(false); }} disabled={!hasOtherTabs}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              Fechar Outras
            </button>
            <button onClick={() => { onCloseToRight(); setCtxOpen(false); }} disabled={!hasTabsToRight}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer">
              <ChevronRight className="h-4 w-4" /> Fechar à Direita
            </button>
            <button onClick={() => { onCloseToLeft(); setCtxOpen(false); }} disabled={!hasTabsToLeft}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer">
              <ChevronLeft className="h-4 w-4" /> Fechar à Esquerda
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── SidebarNavigation ─── */
function SidebarNavigation({ navItems, activeNavId, isCollapsed, onItemClick }: {
  navItems: NavItem[]; activeNavId: string; isCollapsed: boolean;
  onItemClick: (item: NavItem) => void;
}) {
  return (
    <nav className="space-y-1 px-3">
      {navItems.map((item) => {
        const isActive = item.id === activeNavId;
        return (
          <button
            key={item.id}
            onClick={() => onItemClick(item)}
            title={isCollapsed ? item.label : undefined}
            className={cn(
              "w-full cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left relative group",
              isActive
                ? "bg-[#C4D600] text-[#051647] shadow-[0_0_15px_rgba(196,214,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] font-semibold"
                : "text-white/60 hover:bg-white/10 hover:text-white hover:shadow-[0_0_10px_rgba(255,255,255,0.05)]",
              isCollapsed && "justify-center px-0"
            )}
          >
            <item.icon className={cn(
              "h-5 w-5 flex-shrink-0 transition-transform duration-200",
              isActive ? "text-[#051647] scale-110" : "text-current group-hover:scale-110"
            )} />
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-medium text-sm whitespace-nowrap overflow-hidden"
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}
    </nav>
  );
}

/* ─── MobileSidebar ─── */
function MobileSidebar({ logo, companyName, navItems, activeNavId, onItemClick }: {
  logo?: React.ReactNode; companyName: string; navItems: NavItem[];
  activeNavId: string; onItemClick: (item: NavItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const handleItemClick = (item: NavItem) => { onItemClick(item); setOpen(false); };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="h-9 w-9 cursor-pointer text-gray-500 hover:text-[#051647] hover:bg-gray-100 flex-shrink-0 flex items-center justify-center rounded-md">
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-72 bg-[#051647] z-50 flex flex-col shadow-2xl">
            <div className="flex items-center gap-3 p-5 border-b border-white/10">
              {logo || <span className="text-white font-bold text-lg">{companyName}</span>}
            </div>
            <div className="flex-1 py-4 overflow-y-auto">
              <SidebarNavigation navItems={navItems} activeNavId={activeNavId} isCollapsed={false} onItemClick={handleItemClick} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── NewTabButton ─── */
function NewTabButton({ navItems, onAddTab }: { navItems: NavItem[]; onAddTab: (navId?: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        onClick={() => { onAddTab(); setIsOpen(false); }}
        onMouseEnter={() => setIsOpen(true)}
        className="flex h-9 w-9 cursor-pointer items-center justify-center text-gray-500 transition-colors hover:text-[#051647] ml-1 mb-0.5 rounded-md hover:bg-gray-100"
      >
        <Plus className="h-4 w-4" />
      </button>
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50"
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="text-xs text-gray-500 px-3 py-1.5 font-medium">Abrir Rapidamente</div>
          {navItems.map((item) => (
            <button key={item.id} onClick={() => { onAddTab(item.id); setIsOpen(false); }}
              className="w-full cursor-pointer flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
              <item.icon className="h-4 w-4 text-gray-500" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── SidebarWithTabs (Main) ─── */
export function SidebarWithTabs({
  logo,
  companyName = "Óticas Brasil",
  navItems,
  renderContent,
  defaultNavId,
  footer,
}: SidebarWithTabsProps) {
  const defaultNav = defaultNavId || navItems[0]?.id || "";
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [isClient, setIsClient] = useState(false);
  const tabCounterRef = useRef(1);

  // Restore tabs from localStorage on mount
  useEffect(() => {
    setIsClient(true);
    const savedState = localStorage.getItem("crm-sidebar-tabs-state");
    if (savedState) {
      try {
        const { tabs: savedTabs, activeTabId: savedActiveId } = JSON.parse(savedState);
        setTabs(savedTabs);
        setActiveTabId(savedActiveId);
        const maxId = savedTabs.reduce((max: number, tab: Tab) => {
          const match = tab.id.match(/tab-(\d+)-/);
          return match ? Math.max(max, parseInt(match[1])) : max;
        }, 1);
        tabCounterRef.current = maxId;
      } catch {
        setTabs([{ id: "tab-1", activeNavId: defaultNav }]);
        setActiveTabId("tab-1");
      }
    } else {
      setTabs([{ id: "tab-1", activeNavId: defaultNav }]);
      setActiveTabId("tab-1");
    }
  }, [defaultNav]);

  // Persist tabs to localStorage (debounced)
  useEffect(() => {
    if (!isClient || tabs.length === 0) return;
    const handler = setTimeout(() => {
      localStorage.setItem("crm-sidebar-tabs-state", JSON.stringify({ tabs, activeTabId }));
    }, 500);
    return () => clearTimeout(handler);
  }, [tabs, activeTabId, isClient]);

  // Ensure at least one tab exists
  useEffect(() => {
    if (isClient && tabs.length === 0) {
      setTabs([{ id: "tab-1", activeNavId: defaultNav }]);
      setActiveTabId("tab-1");
    }
  }, [isClient, tabs.length, defaultNav]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeNavId = activeTab?.activeNavId || defaultNav;
  const activeTabIndex = tabs.findIndex((t) => t.id === activeTabId);

  const setActiveNav = useCallback((navId: string) => {
    setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, activeNavId: navId } : tab)));
  }, [activeTabId]);

  const addTab = useCallback((navId?: string) => {
    tabCounterRef.current += 1;
    const newTabId = `tab-${tabCounterRef.current}-${Date.now()}`;
    const newTab: Tab = { id: newTabId, activeNavId: navId || defaultNav };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);
  }, [defaultNav]);

  const closeTab = useCallback((tabId: string) => {
    if (tabs.length === 1) return;
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      const newActiveIndex = tabIndex === newTabs.length ? tabIndex - 1 : tabIndex;
      const safeIndex = Math.max(0, newActiveIndex);
      if (newTabs[safeIndex]) setActiveTabId(newTabs[safeIndex].id);
    }
  }, [tabs, activeTabId]);

  const closeOthers = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id === tabId));
    setActiveTabId(tabId);
  }, []);

  const closeToRight = useCallback((tabId: string) => {
    const index = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.slice(0, index + 1);
    setTabs(newTabs);
    if (!newTabs.find((t) => t.id === activeTabId)) setActiveTabId(tabId);
  }, [tabs, activeTabId]);

  const closeToLeft = useCallback((tabId: string) => {
    const index = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.slice(index);
    setTabs(newTabs);
    if (!newTabs.find((t) => t.id === activeTabId)) setActiveTabId(tabId);
  }, [tabs, activeTabId]);

  const closeAll = useCallback(() => {
    if (tabs.length <= 1) return;
    const firstTab = tabs[0];
    setTabs([firstTab]);
    setActiveTabId(firstTab.id);
  }, [tabs]);

  const setActiveTab = useCallback((tabId: string) => setActiveTabId(tabId), []);
  const handleNavItemClick = useCallback((item: NavItem) => setActiveNav(item.id), [setActiveNav]);

  const contextValue = useMemo(() => ({
    tabs, activeTabId, activeNavId, setActiveNav, addTab, closeTab,
    closeOthers, closeToRight, closeToLeft, closeAll, setActiveTab,
  }), [tabs, activeTabId, activeNavId, setActiveNav, addTab, closeTab, closeOthers, closeToRight, closeToLeft, closeAll, setActiveTab]);

  const canCloseTab = tabs.length > 1;
  const hasOtherTabs = tabs.length > 1;

  return (
    <div className="flex h-screen w-full bg-[#f9fafb] overflow-hidden p-3 gap-3">
      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 72 : 280 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="hidden md:flex flex-col bg-[#051647] overflow-visible rounded-2xl shadow-lg relative"
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-4 top-[20px] z-20 h-8 w-8 cursor-pointer rounded-full bg-[#051647] border border-white/20 text-white/70 hover:text-white hover:bg-[#002187] shadow-md flex-shrink-0 flex items-center justify-center"
        >
          <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", !isCollapsed && "rotate-180")} />
        </button>
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center h-[64px] px-4 border-b border-white/10 justify-center">
            <div className="flex items-center justify-center min-w-0">
              {logo || <span className="text-white font-bold text-xl">{companyName}</span>}
            </div>
          </div>

          <div className="flex-1 py-4 overflow-y-auto scrollbar-hide">
            <SidebarNavigation navItems={navItems} activeNavId={activeNavId} isCollapsed={isCollapsed} onItemClick={handleNavItemClick} />
          </div>

          <div className="p-4 border-t border-white/10 h-[73px] flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              {!isCollapsed ? (
                footer ? (
                  <motion.div key="expanded" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="w-full">
                    {footer}
                  </motion.div>
                ) : null
              ) : (
                <motion.div key="collapsed" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="flex justify-center">
                  {logo || <span className="text-white font-bold text-lg">OB</span>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Tab Bar */}
        <div className="flex items-end bg-[#f9fafb] pt-2">
          <div className="md:hidden flex-shrink-0 self-center ml-2">
            <MobileSidebar logo={logo} companyName={companyName} navItems={navItems} activeNavId={activeNavId} onItemClick={handleNavItemClick} />
          </div>

          <div className="flex items-end overflow-x-auto scrollbar-hide flex-1" style={{ scrollbarWidth: "none" }}>
            <Reorder.Group as="ol" axis="x" values={tabs} onReorder={setTabs} className="flex items-end" role="tablist">
              <AnimatePresence initial={false}>
                {tabs.map((tab, index) => {
                  const isActive = tab.id === activeTabId;
                  const isFirst = index === 0;
                  const isLast = index === tabs.length - 1;
                  const hasRightNeighborActive = index < tabs.length - 1 && tabs[index + 1].id === activeTabId;
                  return (
                    <Reorder.Item value={tab} as="li" layout key={tab.id}
                      initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }} whileDrag={{ cursor: "grabbing" }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className="relative group flex-shrink-0" style={{ zIndex: isActive ? 10 : 1 }}>
                      <ChromeTab
                        tab={tab} isActive={isActive} isFirst={isFirst} isLast={isLast}
                        canClose={canCloseTab} navItems={navItems} hasRightNeighborActive={hasRightNeighborActive}
                        onTabClick={() => setActiveTab(tab.id)} onTabClose={() => closeTab(tab.id)}
                        onCloseOthers={() => closeOthers(tab.id)} onCloseToRight={() => closeToRight(tab.id)}
                        onCloseToLeft={() => closeToLeft(tab.id)} hasOtherTabs={hasOtherTabs}
                        hasTabsToRight={index < tabs.length - 1} hasTabsToLeft={index > 0}
                      />
                    </Reorder.Item>
                  );
                })}
              </AnimatePresence>
            </Reorder.Group>
            <motion.div layout className="flex-shrink-0">
              <NewTabButton navItems={navItems} onAddTab={addTab} />
            </motion.div>
          </div>
        </div>

        {/* Content Area */}
        <main className="flex-1 overflow-hidden bg-[#f9fafb] p-0 md:pr-3 md:pb-3">
          <div className={cn(
            "h-full bg-white overflow-auto transition-all duration-300 ease-in-out",
            "md:rounded-br-3xl md:rounded-bl-3xl md:rounded-tr-3xl",
            activeTabIndex !== 0 && "md:rounded-tl-3xl"
          )}>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeTabId}-${activeNavId}`}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }} className="h-full"
              >
                {renderContent(activeNavId)}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}