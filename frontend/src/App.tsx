import React, { useState, useEffect, useRef } from 'react';
import { SignedIn, SignedOut, SignIn, UserButton, useUser } from '@clerk/clerk-react';
import SpendingDashboard from './components/SpendingDashboard';

interface ReceiptData {
  rawText: string;
}

interface ParsedItem {
  name: string;
  price: number;
  category: string;
  raw_line: string;
}

interface Participant {
  clerk_id: string;
  display_name: string;
  email: string;
}

interface ReceiptRecord {
  id: number;
  raw_text: string;
  parsed_items: ParsedItem[];
  created_at: string;
  amount_owed: number;
  is_owner: boolean;
  uploaded_by_name: string;
}

type View = 'upload' | 'history' | 'dashboard';

// Reading dynamic environmental base variable safely
const API_URL = import.meta.env.VITE_API_URL;

// Dynamic Category Colors mapped alongside modern accessible icons
const CATEGORY_COLORS: Record<string, { bg: string; text: string; hex: string; icon: string }> = {
  'Food & Beverage': { bg: 'rgba(249,115,22,0.12)', text: '#fb923c', hex: '#f97316', icon: '🍔' },
  'Groceries':       { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', hex: '#22c55e', icon: '🛒' },
  'Transport':       { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', hex: '#3b82f6', icon: '🚗' },
  'Healthcare':      { bg: 'rgba(236,72,153,0.12)', text: '#f472b6', hex: '#ec4899', icon: '💊' },
  'Entertainment':   { bg: 'rgba(168,85,247,0.12)', text: '#c084fc', hex: '#a855f7', icon: '🎮' },
  'Utilities':       { bg: 'rgba(20,184,166,0.12)', text: '#2dd4bf', hex: '#14b8a6', icon: '💡' },
  'Shopping':        { bg: 'rgba(234,179,8,0.12)',  text: '#facc15', hex: '#eab308', icon: '🛍️' },
  'Education':       { bg: 'rgba(6,182,212,0.12)',  text: '#22d3ee', hex: '#06b6d4', icon: '📚' },
  'Personal Care':   { bg: 'rgba(244,63,94,0.12)',  text: '#fb7185', hex: '#f43f5e', icon: '🧴' },
  'Other':           { bg: 'rgba(148,163,184,0.10)',text: '#94a3b8', hex: '#94a3b8', icon: '📝' },
};

function getCategoryStyle(cat: string) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['Other'];
}

const Icons = {
  UploadCloud: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
  ),
  History: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  ),
  PieChart: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
  ),
  FileText: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
  ),
  Wallet: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>
  ),
  Sparkles: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
  )
};

const NAV_ITEMS: { id: View; label: string; renderIcon: () => React.ReactNode }[] = [
  { id: 'upload',    label: 'Scan Receipt', renderIcon: Icons.UploadCloud },
  { id: 'history',   label: 'History', renderIcon: Icons.History },
  { id: 'dashboard', label: 'Insights', renderIcon: Icons.PieChart },
];

const clerkAppearance = {
  variables: {
    colorBackground: '#0b1329',
    colorText: '#f8fafc',
    colorTextSecondary: '#94a3b8',
    colorTextOnPrimaryBackground: '#ffffff',
    colorPrimary: '#10b981',
    colorInputBackground: '#0f172a',
    colorInputText: '#f8fafc',
    colorNeutral: '#f8fafc',
    borderRadius: '14px',
  },
  elements: {
    card: { backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' },
    headerTitle: { color: '#f8fafc', fontWeight: '700', fontFamily: 'Inter' },
    headerSubtitle: { color: '#94a3b8', fontFamily: 'Inter' },
    formFieldLabel: { color: '#94a3b8', fontSize: '13px' },
    formFieldInput: { backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.08)', color: '#f8fafc' },
    formButtonPrimary: { backgroundColor: '#10b981', color: '#ffffff', fontWeight: '600' },
  },
};

function App() {
  const { user } = useUser();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading]           = useState(false);
  const [receipt, setReceipt]           = useState<ReceiptData | null>(null);
  const [isEditing, setIsEditing]       = useState(false);
  const [parsedItems, setParsedItems]   = useState<ParsedItem[]>([]);
  const [reParsing, setReParsing]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [view, setView]                 = useState<View>('upload');
  const [history, setHistory]           = useState<ReceiptRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toast, setToast]               = useState<string | null>(null);

  /* Receipt Splitting Core States */
  const [showSplitPanel, setShowSplitPanel] = useState(false);
  const [friendsList, setFriendsList]       = useState<Participant[]>([]);
  const [friendSearchEmail, setFriendSearchEmail] = useState('');
  const [itemAssignments, setItemAssignments] = useState<Record<number, string[]>>({});
  const [extraCharges, setExtraCharges]     = useState('0');
  const [splitResult, setSplitResult]       = useState<any | null>(null);
  const [calculatingSplit, setCalculatingSplit] = useState(false);

  /* Live AI Feedback Journey States */
  const [scanStep, setScanStep] = useState<number>(0);

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      const myDisplayName = user.firstName || user.username || 'Me';
      const myEmail = user.primaryEmailAddress?.emailAddress || '';
      
      fetch(`${API_URL}/api/sync-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerk_id: user.id, email: myEmail, display_name: myDisplayName })
      })
      .then(() => {
        setFriendsList([{ clerk_id: user.id, display_name: `${myDisplayName} (Me)`, email: myEmail }]);
      })
      .catch(err => console.error(err));
    }
  }, [user]);

  useEffect(() => {
    if (user && history.length === 0) {
      fetchHistory();
    }
  }, [user]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        setSelectedFile(file);
      } else {
        showToast('Please upload a PNG, JPG, or PDF.');
      }
    }
  };

  const handleParse = async (text: string) => {
    try {
      const res = await fetch(`${API_URL}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: text }),
      });
      const data = await res.json();
      
      const newItems = data.items || [];
      setParsedItems(newItems);
      
      const freshlyGeneratedAssignments: Record<number, string[]> = {};
      newItems.forEach((_: any, idx: number) => {
        if (user) freshlyGeneratedAssignments[idx] = [user.id];
      });
      
      setItemAssignments(freshlyGeneratedAssignments);
      setSplitResult(null);
    } catch {
      setParsedItems([]);
    }
  };

  const handleReParse = async () => {
    if (!receipt || !receipt.rawText.trim()) return;
    setReParsing(true);
    await handleParse(receipt.rawText);
    setReParsing(false);
    showToast('Receipt re-scanned');
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setReceipt(null);
    setIsEditing(false);
    setParsedItems([]);
    setSplitResult(null);
    
    setScanStep(1); 
    const stepInterval = setInterval(() => {
      setScanStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 1200);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReceipt({ rawText: data.text || '' });
      setIsEditing(true);
      await handleParse(data.text || '');
      fetchHistory(); 
    } catch {
      showToast("We couldn't read that receipt. Give it another try.");
    } finally {
      clearInterval(stepInterval);
      setScanStep(0);
      setLoading(false);
    }
  };

  const handleSearchFriend = async () => {
    if (!friendSearchEmail.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/search-friend?email=${encodeURIComponent(friendSearchEmail.trim())}`);
      if (!res.ok) {
        showToast("We couldn't find anyone with that email.");
        return;
      }
      const data = await res.json();
      if (friendsList.some(f => f.clerk_id === data.clerk_id)) {
        showToast('Already added.');
        return;
      }
      setFriendsList([...friendsList, { clerk_id: data.clerk_id, display_name: data.display_name, email: data.email }]);
      showToast(`Added ${data.display_name}`);
      setFriendSearchEmail('');
    } catch {
      showToast('Something went wrong. Please try again.');
    }
  };

  const calculateLiveSplitMatrix = async () => {
    setCalculatingSplit(true);
    const packagedItems = parsedItems.map((item, index) => ({
      name: item.name,
      price: item.price,
      assignedToIds: itemAssignments[index] || (user ? [user.id] : [])
    }));

    try {
      const res = await fetch(`${API_URL}/api/split-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: packagedItems,
          participants: friendsList.map(f => ({ clerk_id: f.clerk_id, display_name: f.display_name })),
          adjustment: parseFloat(extraCharges || '0.0')
        })
      });
      const data = await res.json();
      setSplitResult(data.breakdown);
    } catch {
      showToast("Couldn't calculate the split.");
    } finally {
      setCalculatingSplit(false);
    }
  };

  const toggleUserAssignment = (itemIdx: number, targetClerkId: string) => {
    const current = itemAssignments[itemIdx] || [];
    const updated = current.includes(targetClerkId)
      ? current.filter(id => id !== targetClerkId)
      : [...current, targetClerkId];
    
    setItemAssignments({
      ...itemAssignments,
      [itemIdx]: updated.length === 0 && user ? [user.id] : updated
    });
  };

  const handleSave = async () => {
    if (!receipt || !user) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          raw_text: receipt.rawText,
          parsed_items: parsedItems,
          split_distribution: splitResult
        }),
      });
      if (!res.ok) throw new Error();
      showToast('Receipt saved');
      setIsEditing(false);
      setReceipt(null);
      setSelectedFile(null);
      setParsedItems([]);
      setShowSplitPanel(false);
      setSplitResult(null);
      fetchHistory();
    } catch {
      showToast("Couldn't save your receipt.");
    } finally {
      setSaving(false);
    }
  };

  const fetchHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/receipts?user_id=${user.id}`);
      const data = await res.json();
      setHistory(data.receipts || []);
    } catch {
      showToast("Couldn't load your history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleNavClick = (id: View) => {
    setView(id);
    if (id === 'history') fetchHistory();
  };

  const totalMonthlySpending = history.reduce((sum, item) => sum + (item.amount_owed || 0), 0);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          margin: 0;
          min-height: 100vh;
          overflow-x: hidden;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #f8fafc;
          background-color: #07111F;
        }

        /* ============================================================
           FINTRACE ORIGINAL DIGITAL ACCOUNTING CANVAS BACKGROUND
           ============================================================ */
        .fintrace-bg {
          position: fixed;
          inset: 0;
          z-index: 0; 
          overflow: hidden;
          background-color: #07111F;
          /* Accounting Ledger grid layout structure */
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }

        /* Soft Vignette and lighting variations without floating blobs */
        .fintrace-bg::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 30%, transparent 20%, rgba(4, 11, 22, 0.6) 80%);
          pointer-events: none;
        }

        /* Subtle Receipt Paper Grain Texture */
        .fintrace-grain {
          position: absolute;
          inset: 0;
          opacity: 0.025;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          pointer-events: none;
        }

        /* Ultra-low opacity receipt fragment watermarks */
        .receipt-watermark {
          position: absolute;
          font-family: 'JetBrains Mono', monospace;
          color: #ffffff;
          opacity: 0.02;
          user-select: none;
          pointer-events: none;
          font-weight: 500;
          white-space: nowrap;
        }

        /* Transaction Tracing Line Paths */
        .fintrace-traces {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .trace-path {
          fill: none;
          stroke: rgba(255, 255, 255, 0.03);
          stroke-width: 1.5;
        }
        .trace-path-highlight {
          fill: none;
          stroke: #10B981;
          stroke-width: 1.5;
          opacity: 0.06;
        }

        /* Premium Modern Minimal Foreground Cards */
        .workspace-card {
          background: #111827;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }

        /* Authentic Monospaced White Paper Receipt UI */
        .receipt-paper-card {
          background: #F9FAFB;
          color: #111827;
          border-radius: 12px;
          box-shadow: 0 30px 60px rgba(0,0,0,0.6);
          font-family: 'JetBrains Mono', monospace;
          position: relative;
          overflow: hidden;
          border: 1px solid #E5E7EB;
          max-width: 480px;
          margin: 0 auto;
        }
        
        .receipt-paper-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background-image: linear-gradient(-45deg, transparent 4px, #07111F 4px), linear-gradient(45deg, transparent 4px, #07111F 4px);
          background-size: 8px 12px;
        }

        .action-primary {
          background: #10b981;
          color: #fff;
          font-weight: 600;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .action-primary:hover:not(:disabled) {
          background: #059669;
        }

        .action-secondary {
          background: rgba(31, 41, 55, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          font-weight: 600;
          border-radius: 12px;
          cursor: pointer;
        }

        .nav-link {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 13.5px;
          font-weight: 500;
          background: transparent;
          color: #94a3b8;
          transition: all 0.2s;
        }
        .nav-link.active {
          background: rgba(255, 255, 255, 0.05);
          color: #10b981;
          font-weight: 600;
        }

        .form-input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(17, 24, 39, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #f8fafc;
          font-family: inherit;
          font-size: 14px;
          outline: none;
        }

        .scanner-container {
          position: relative;
          overflow: hidden;
        }
        .scanner-laser {
          position: absolute;
          inset: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, #10b981, transparent);
          animation: scanMove 2.5s linear infinite;
        }

        @keyframes scanMove {
          0% { top: 0%; opacity: 0.2; }
          50% { top: 100%; opacity: 0.6; }
          100% { top: 0%; opacity: 0.2; }
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade { animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Background layer engine */}
      <div className="fintrace-bg">
        <div className="fintrace-grain" />

        {/* Scattered Low Opacity Subconscious Financial Markers & Emoticons */}
        <div className="receipt-watermark" style={{ top: '10%', left: '5%', transform: 'rotate(-8deg)', fontSize: '13px' }}>🧾 TOTAL $12.90</div>
        <div className="receipt-watermark" style={{ top: '15%', right: '12%', transform: 'rotate(5deg)', fontSize: '12px' }}>SUBTOTAL 🧾</div>
        <div className="receipt-watermark" style={{ top: '45%', left: '80%', transform: 'rotate(-15deg)', fontSize: '14px' }}>🧾 VISA **** 4412</div>
        <div className="receipt-watermark" style={{ top: '75%', left: '8%', transform: 'rotate(12deg)', fontSize: '13px' }}>🧾 * THANK YOU *</div>
        <div className="receipt-watermark" style={{ top: '85%', right: '20%', transform: 'rotate(-4deg)', fontSize: '12px' }}>QTY: 04 ITEM 🧾</div>
        <div className="receipt-watermark" style={{ top: '28%', left: '72%', transform: 'rotate(18deg)', fontSize: '13px' }}>🧾 GST INCLUDED</div>

        {/* Audit Trail Signature Lifecycle Tracing System Lines */}
        <svg className="fintrace-traces">
          {/* Main Transaction Lifecycle Flow Path */}
          <path className="trace-path" d="M 100,200 L 250,200 L 250,450 L 600,450 L 600,750" />
          <path className="trace-path-highlight" d="M 100,200 L 250,200 L 250,450 L 600,450 L 600,750" strokeDasharray="5 5" />
          
          {/* Natural winding audit path system structures */}
          <path className="trace-path" d="M 750,100 Q 820,300 680,500 T 800,900" />
          
          {/* Process flow indicator markers (Implying Upload -> OCR -> Categorize -> Dashboard lifecycle) */}
          <circle cx="100" cy="200" r="4" fill="#07111F" stroke="#10B981" strokeWidth="2" /> {/* Node 1: Circle */}
          <rect x="246" y="446" width="8" height="8" fill="#07111F" stroke="#f8fafc" strokeWidth="1.5" /> {/* Node 2: Square */}
          
          {/* Node 3: Dotted Ledger Barcode mark indicator */}
          <g transform="translate(595, 745)">
            <line x1="0" y1="0" x2="10" y2="0" stroke="#10B981" strokeWidth="2" />
            <line x1="0" y1="3" x2="6" y2="3" stroke="#ffffff" strokeWidth="1.5" />
            <line x1="0" y1="6" x2="10" y2="6" stroke="#ffffff" strokeWidth="2" />
          </g>
        </svg>
      </div>

      {/* Main Foreground Container Layer explicit stacking context separation */}
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
        {toast && (
          <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, background: '#111827', border: '1px solid #10b981', borderRadius: 12, padding: '14px 20px', color: '#f8fafc', fontSize: 14, fontWeight: 500 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#10b981' }}>✓</span>
              {toast}
            </div>
          </div>
        )}

        <SignedOut>
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 32 }}>
            <div style={{ textAlign: 'center', maxWidth: 440, animation: 'fadeIn 0.5s ease' }}>
              <div style={{ display: 'inline-flex', padding: 14, borderRadius: 16, background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', marginBottom: 16 }}>
                <Icons.Wallet />
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.04em', color: '#f8fafc', marginBottom: 8 }}>FinTrace</h1>
              <p style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.5 }}>Scan any receipt. Split it with friends. See where your money actually goes.</p>
            </div>
            <div style={{ width: '100%', maxWidth: 400, display: 'flex', justifyContent: 'center' }}>
              <SignIn routing="hash" appearance={clerkAppearance} />
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 100px' }}>
            
            {/* Header */}
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }} className="animate-fade">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', background: '#10b981', borderRadius: 10, padding: 8, color: '#fff' }}>
                  <Icons.Wallet />
                </div>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: '#f8fafc' }}>FinTrace</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 99, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8', fontWeight: 500 }}>NUS Orbital 2026</span>
                <UserButton appearance={clerkAppearance} />
              </div>
            </header>

            {/* Navigation Tabbed Interface */}
            <nav style={{ display: 'flex', gap: 6, background: 'rgba(17, 24, 39, 0.6)', borderRadius: 14, padding: 6, border: '1px solid rgba(255, 255, 255, 0.06)', marginBottom: 32 }} className="animate-fade">
              {NAV_ITEMS.map(({ id, label, renderIcon: Icon }) => (
                <button key={id} className={`nav-link ${view === id ? 'active' : ''}`} onClick={() => handleNavClick(id)}>
                  <Icon /> {label}
                </button>
              ))}
            </nav>

            {/* ── UPLOAD VIEW ── */}
            {view === 'upload' && (
              <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {!isEditing && (
                  <>
                    {/* Humanized Financial Snapshot Welcomer Area */}
                    <div className="workspace-card" style={{ padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                      <div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>Hey, {user?.firstName || 'there'} 👋</h3>
                        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>
                          {history.length > 0 ? "Here's everything you've tracked so far." : 'Nothing tracked yet — upload a receipt to get started.'}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your spending this month</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#10B981', marginTop: 2 }}>${totalMonthlySpending.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Drag and Drop Container Workspace Area */}
                    <div 
                      className="workspace-card scanner-container" 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      style={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '60px 24px', 
                        border: isDragOver ? '1px dashed #10b981' : '1px dashed rgba(255, 255, 255, 0.12)', 
                        cursor: 'pointer', background: isDragOver ? 'rgba(16, 185, 129, 0.02)' : '#111827', 
                        textAlign: 'center'
                      }}
                    >
                      {loading && <div className="scanner-laser" />}
                      <input type="file" ref={fileInputRef} accept="image/*,application/pdf" onChange={handleFileChange} style={{ display: 'none' }} />
                      <div style={{ color: selectedFile ? '#10b981' : '#94a3b8' }}>
                        <Icons.FileText />
                      </div>
                      <div>
                        <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                          {selectedFile ? 'Receipt ready' : 'Drop a receipt here'}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: 13 }}>
                          {selectedFile ? selectedFile.name : 'Drag & drop or click to upload'}
                        </div>
                      </div>
                    </div>

                    {/* Contextual Active AI Reading Timeline feedback */}
                    {loading && (
                      <div className="workspace-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 14, height: 14, border: '2px solid rgba(16,185,129,0.2)', borderTop: '2px solid #10b981', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>AI is reading your receipt...</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 24, fontSize: 13, color: '#94a3b8' }}>
                          <div style={{ color: scanStep >= 1 ? '#10b981' : '#64748b' }}>{scanStep >= 1 ? '✓' : '•'} Extracting line items...</div>
                          <div style={{ color: scanStep >= 2 ? '#10b981' : '#64748b' }}>{scanStep >= 2 ? '✓' : '•'} Categorising purchases...</div>
                          <div style={{ color: scanStep >= 3 ? '#10b981' : '#64748b' }}>{scanStep >= 3 ? '✓' : '•'} Almost done...</div>
                        </div>
                      </div>
                    )}

                    {selectedFile && !loading && (
                      <button className="action-primary" onClick={handleUpload} style={{ width: '100%', padding: '14px', fontSize: 14.5 }}>
                        Scan Receipt
                      </button>
                    )}
                  </>
                )}

                {/* Physical Receipt Presentation Mode Interface */}
                {isEditing && receipt && (
                  <div className="receipt-paper-card" style={{ padding: '36px 28px 28px', animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1px dashed #D1D5DB', paddingBottom: 12 }}>
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingRight: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', letterSpacing: '0.02em' }}>Review Results</h3>
                        <p style={{ color: '#4B5563', fontSize: 12, marginTop: 2 }}>Check everything looks right, then save.</p>
                      </div>
                      <button onClick={() => { setIsEditing(false); setReceipt(null); setSelectedFile(null); setParsedItems([]); setShowSplitPanel(false); }} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 18, position: 'absolute', right: 24, top: 34 }}>✕</button>
                    </div>

                    {/* Raw Input Window */}
                    <div style={{ background: '#F3F4F6', borderRadius: 8, overflow: 'hidden', marginBottom: 20, border: '1px solid #E5E7EB' }}>
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>ORIGINAL TEXT</span>
                        <button className="action-secondary" onClick={handleReParse} disabled={reParsing} style={{ padding: '4px 8px', borderRadius: 4, fontSize: 11, background: '#fff', color: '#374151', border: '1px solid #D1D5DB' }}>
                          Re-scan
                        </button>
                      </div>
                      <textarea 
                        rows={4} 
                        value={receipt.rawText} 
                        onChange={(e) => setReceipt({ rawText: e.target.value })} 
                        style={{ width: '100%', padding: '12px', border: 'none', background: 'transparent', color: '#111827', fontFamily: 'monospace', fontSize: 12, outline: 'none', resize: 'vertical', lineHeight: 1.4 }} 
                      />
                    </div>

                    {/* Actions Grid */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>ITEMS</span>
                      <button onClick={() => setShowSplitPanel(!showSplitPanel)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, background: 'transparent', color: '#2563EB', border: '1px solid #93C5FD', cursor: 'pointer', fontWeight: 600 }}>
                        👥 {showSplitPanel ? 'Close' : 'Split Bill'}
                      </button>
                    </div>

                    {/* Split Allocations Block */}
                    {showSplitPanel && (
                      <div style={{ background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 8, padding: 14, marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', marginBottom: 8 }}>SPLIT WITH</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                          <input type="email" placeholder="Friend's email" value={friendSearchEmail} onChange={(e) => setFriendSearchEmail(e.target.value)} style={{ flex: 1, padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 12, background: '#fff', color: '#111827' }} />
                          <button onClick={handleSearchFriend} style={{ padding: '0 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12, border: 'none', cursor: 'pointer' }}>
                            Add
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          {friendsList.map(f => (
                            <span key={f.clerk_id} style={{ background: '#fff', border: '1px solid #E5E7EB', color: '#374151', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                              • {f.display_name}
                            </span>
                          ))}
                        </div>

                        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                          <label style={{ fontSize: 12, color: '#4B5563' }}>Tax & extra charges ($):</label>
                          <input type="number" value={extraCharges} onChange={(e) => setExtraCharges(e.target.value)} style={{ width: 80, padding: '4px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12, background: '#fff', color: '#111827' }} />
                        </div>

                        <button onClick={calculateLiveSplitMatrix} disabled={friendsList.length < 2 || calculatingSplit} style={{ width: '100%', padding: '8px', fontSize: 12, background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                          Calculate Split
                        </button>

                        {splitResult && (
                          <div style={{ marginTop: 12, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6, padding: 10 }}>
                            {Object.entries(splitResult).map(([uid, bill]: any) => (
                              <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                                <span style={{ color: '#4B5563' }}>{bill.display_name}</span>
                                <span style={{ color: '#111827', fontWeight: 600 }}>${bill.total?.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Monospaced Receipt Grid */}
                    {parsedItems.length > 0 && (
                      <div style={{ borderBottom: '1px dashed #D1D5DB', marginBottom: 20, paddingBottom: 10 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>
                              <th style={{ padding: '6px 0', textAlign: 'left', fontWeight: 500 }}>ITEM</th>
                              <th style={{ padding: '6px 0', textAlign: 'left', fontWeight: 500 }}>CATEGORY</th>
                              <th style={{ padding: '6px 0', textAlign: 'right', fontWeight: 500 }}>PRICE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedItems.map((item, i) => {
                              const cs = getCategoryStyle(item.category);
                              const currentAssignments = itemAssignments[i] || [];
                              return (
                                <React.Fragment key={i}>
                                  <tr>
                                    <td style={{ padding: '8px 0', color: '#111827' }}>{item.name}</td>
                                    <td style={{ padding: '8px 0' }}>
                                      <span style={{ color: cs.hex, fontWeight: 600, fontSize: 11 }}>
                                        {cs.icon} {item.category}
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px 0', textAlign: 'right', color: '#111827', fontWeight: 600 }}>${item.price.toFixed(2)}</td>
                                  </tr>
                                  {showSplitPanel && (
                                    <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                                      <td colSpan={3} style={{ padding: '2px 0 8px' }}>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                          {friendsList.map(f => {
                                            const active = currentAssignments.includes(f.clerk_id);
                                            return (
                                              <span 
                                                key={f.clerk_id} 
                                                onClick={() => { toggleUserAssignment(i, f.clerk_id); setSplitResult(null); }} 
                                                style={{ 
                                                  fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', 
                                                  background: active ? '#DBEAFE' : '#F3F4F6', 
                                                  color: active ? '#1E40AF' : '#6B7280',
                                                  border: `1px solid ${active ? '#BFDBFE' : '#E5E7EB'}`
                                                }}
                                              >
                                                {f.display_name.split(" ")[0]}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 12 }}>
                      <button className="action-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '12px', fontSize: 13.5 }}>
                        Save Receipt
                      </button>
                      <button className="action-secondary" onClick={() => { setIsEditing(false); setReceipt(null); setSelectedFile(null); setParsedItems([]); setShowSplitPanel(false); setSplitResult(null); }} style={{ padding: '0 20px', fontSize: 13.5, background: '#E5E7EB', color: '#374151', border: 'none' }}>Discard</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── HISTORY VIEW ── */}
            {view === 'history' && (
              <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ marginBottom: 8 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.03em' }}>Receipt History</h2>
                  <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 2 }}>Every receipt you've scanned or been added to.</p>
                </div>

                {historyLoading && (
                  <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.05)', borderTop: '3px solid #10b981', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    <span style={{ color: '#64748b', fontSize: 13 }}>Loading your receipts...</span>
                  </div>
                )}

                {!historyLoading && history.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 24px', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 18, background: '#111827' }}>
                    <p style={{ color: '#64748b', fontWeight: 500, fontSize: 14.5 }}>No receipts yet. Scan your first one to see it here.</p>
                  </div>
                )}

                {history.map((r) => (
                  <div key={r.id} className="workspace-card" style={{ overflow: 'hidden', borderLeft: r.is_owner ? '1px solid rgba(255,255,255,0.05)' : '3px solid #10b981' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ background: r.is_owner ? 'rgba(255,255,255,0.03)' : 'rgba(16, 185, 129, 0.08)', color: r.is_owner ? '#94a3b8' : '#34d399', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>
                          {r.is_owner ? 'Yours' : `Shared by ${r.uploaded_by_name}`}
                        </span>
                        <span style={{ color: '#64748b', fontSize: 13 }}>
                          {new Date(r.created_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>Total: ${r.amount_owed?.toFixed(2)}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <tbody>
                        {r.parsed_items.map((item, idx) => {
                          const cs = getCategoryStyle(item.category);
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.01)' }}>
                              <td style={{ padding: '11px 20px', fontSize: 13, color: '#cbd5e1' }}>
                                <span style={{ marginRight: 8 }}>{cs.icon}</span>
                                {item.name}
                              </td>
                              <td style={{ padding: '11px 20px', textAlign: 'right', fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' }}>${item.price.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {/* ── DASHBOARD VIEW ── */}
            {view === 'dashboard' && (
              <div className="animate-fade">
                <SpendingDashboard userId={user?.id || ''} />
              </div>
            )}
          </div>
        </SignedIn>
      </div>
    </>
  );
}

export default App;