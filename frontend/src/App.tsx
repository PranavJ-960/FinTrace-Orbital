import React, { useState, useEffect } from 'react';
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

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'Food & Beverage': { bg: 'rgba(249,115,22,0.15)', text: '#fb923c' },
  'Groceries':       { bg: 'rgba(34,197,94,0.15)',  text: '#4ade80' },
  'Transport':       { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' },
  'Healthcare':      { bg: 'rgba(236,72,153,0.15)', text: '#f472b6' },
  'Entertainment':   { bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
  'Utilities':       { bg: 'rgba(20,184,166,0.15)', text: '#2dd4bf' },
  'Shopping':        { bg: 'rgba(234,179,8,0.15)',  text: '#facc15' },
  'Education':       { bg: 'rgba(6,182,212,0.15)',  text: '#22d3ee' },
  'Personal Care':   { bg: 'rgba(244,63,94,0.15)',  text: '#fb7185' },
  'Other':           { bg: 'rgba(148,163,184,0.12)',text: '#94a3b8' },
};

function getCategoryStyle(cat: string) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['Other'];
}

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: 'upload',    label: 'Upload',    icon: '↑' },
  { id: 'history',   label: 'History',   icon: '🕐' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
];

const clerkAppearance = {
  variables: {
    colorBackground: '#0f172a',
    colorText: '#f1f5f9',
    colorTextSecondary: '#94a3b8',
    colorTextOnPrimaryBackground: '#ffffff',
    colorPrimary: '#3b82f6',
    colorInputBackground: '#1e293b',
    colorInputText: '#f1f5f9',
    colorNeutral: '#f1f5f9',
    borderRadius: '10px',
  },
  elements: {
    card: { backgroundColor: '#0f172a', border: '1px solid #1e293b', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
    headerTitle: { color: '#f1f5f9', fontWeight: '700' },
    headerSubtitle: { color: '#94a3b8' },
    formFieldLabel: { color: '#94a3b8', fontSize: '13px' },
    formFieldInput: { backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' },
    formButtonPrimary: { backgroundColor: '#2563eb', color: '#ffffff', fontWeight: '600' },
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

  useEffect(() => {
    if (user) {
      const myDisplayName = user.firstName || user.username || 'Me';
      const myEmail = user.primaryEmailAddress?.emailAddress || '';
      
      fetch('http://127.0.0.1:8000/api/sync-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerk_id: user.id, email: myEmail, display_name: myDisplayName })
      })
      .then(() => {
        setFriendsList([{ clerk_id: user.id, display_name: `${myDisplayName} (Me)`, email: myEmail }]);
      })
      .catch(err => console.error("Global Directory Sync Failure:", err));
    }
  }, [user]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
  };

  const handleParse = async (text: string) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: text }),
      });
      const data = await res.json();
      setParsedItems(data.items || []);
      
      const defaultAssignments: Record<number, string[]> = {};
      (data.items || []).forEach((_: any, idx: number) => {
        if (user) defaultAssignments[idx] = [user.id];
      });
      setItemAssignments(defaultAssignments);
    } catch {
      setParsedItems([]);
    }
  };

  const handleReParse = async () => {
    if (!receipt) return;
    setReParsing(true);
    await handleParse(receipt.rawText);
    setReParsing(false);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setReceipt(null);
    setIsEditing(false);
    setParsedItems([]);
    setSplitResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReceipt({ rawText: data.text || '' });
      setIsEditing(true);
      await handleParse(data.text || '');
    } catch {
      showToast('Could not process the image. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchFriend = async () => {
    if (!friendSearchEmail.trim()) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/search-friend?email=${encodeURIComponent(friendSearchEmail.trim())}`);
      if (!res.ok) {
        showToast("Friend not found in database. Double check email!");
        return;
      }
      const data = await res.json();
      if (friendsList.some(f => f.clerk_id === data.clerk_id)) {
        showToast("Friend already linked in current session.");
        return;
      }
      setFriendsList([...friendsList, { clerk_id: data.clerk_id, display_name: data.display_name, email: data.email }]);
      showToast(`Successfully linked ${data.display_name}!`);
      setFriendSearchEmail('');
    } catch {
      showToast("Lookup query faulted.");
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
      const res = await fetch('http://127.0.0.1:8000/api/split-receipt', {
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
      showToast("Splitting arithmetic pipeline dropped.");
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
      const res = await fetch('http://127.0.0.1:8000/api/save', {
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
      showToast(`Receipt committed across active nodes!`);
      setIsEditing(false);
      setReceipt(null);
      setSelectedFile(null);
      setParsedItems([]);
      setShowSplitPanel(false);
      setSplitResult(null);
    } catch {
      showToast('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const fetchHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/receipts?user_id=${user.id}`);
      const data = await res.json();
      setHistory(data.receipts || []);
    } catch {
      showToast('Could not load history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleNavClick = (id: View) => {
    setView(id);
    if (id === 'history') fetchHistory();
  };

  const estimatedTotal = parsedItems.reduce((s, i) => s + i.price, 0);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #020817; color: #f1f5f9; font-family: 'Inter', sans-serif; min-height: 100vh; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
        .upload-zone:hover { border-color: #3b82f6 !important; background: rgba(59,130,246,0.05) !important; }
        .nav-btn:hover { background: #1e293b !important; color: #f1f5f9 !important; }
        .action-btn:hover { opacity: 0.88; }
        .receipt-row:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>

      {toast && <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 18px', color: '#f1f5f9', fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'slideIn 0.2s ease' }}>{toast}</div>}

      <SignedOut>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🧾</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>FinTrace</h1>
            <p style={{ color: '#64748b', marginTop: 6, fontSize: 15 }}>Scan receipts. Track spending. Stay in control.</p>
          </div>
          <SignIn routing="hash" appearance={clerkAppearance} />
        </div>
      </SignedOut>

      <SignedIn>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px 80px' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 16px', borderBottom: '1px solid #1e293b', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>🧾</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>FinTrace</span>
            </div>
            <UserButton appearance={clerkAppearance} />
          </header>

          <nav style={{ display: 'flex', gap: 4, background: '#0f172a', borderRadius: 12, padding: 4, border: '1px solid #1e293b', marginBottom: 28 }}>
            {NAV_ITEMS.map(({ id, label, icon }) => (
              <button key={id} className="nav-btn" onClick={() => handleNavClick(id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: view === id ? '#1e293b' : 'transparent', color: view === id ? '#f1f5f9' : '#64748b', fontFamily: 'inherit' }}>
                <span style={{ fontSize: 14 }}>{icon}</span> {label}
              </button>
            ))}
          </nav>

          {/* ── UPLOAD VIEW ── */}
          {view === 'upload' && (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              {!isEditing && (
                <>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>Upload a Receipt</h2>
                  <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Take a photo or upload an image — we'll extract and categorise every item automatically.</p>
                  <label className="upload-zone" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 24px', border: '2px dashed #1e293b', borderRadius: 14, cursor: 'pointer', background: '#0a0f1a', transition: 'all 0.2s', textAlign: 'center' }}>
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                    <div style={{ fontSize: 36 }}>{selectedFile ? '✅' : '📷'}</div>
                    <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>{selectedFile ? selectedFile.name : 'Click to choose a receipt image'}</div>
                  </label>

                  {selectedFile && (
                    <button className="action-btn" onClick={handleUpload} disabled={loading} style={{ marginTop: 16, width: '100%', padding: '12px 20px', background: loading ? '#1e3a5f' : '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                      {loading && <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                      {loading ? 'Processing OCR…' : 'Scan & Parse Receipt'}
                    </button>
                  )}
                </>
              )}

              {isEditing && receipt && (
                <div style={{ animation: 'fadeUp 0.2s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Review & Correct</h2>
                    </div>
                    <button onClick={() => { setIsEditing(false); setReceipt(null); setSelectedFile(null); setParsedItems([]); setShowSplitPanel(false); }} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 20, fontFamily: 'inherit' }}>✕</button>
                  </div>

                  <div style={{ background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                    <textarea rows={6} value={receipt.rawText} onChange={(e) => setReceipt({ rawText: e.target.value })} style={{ width: '100%', padding: '14px', border: 'none', background: 'transparent', color: '#94a3b8', fontFamily: 'monospace', fontSize: 12.5 }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>Extracted Summary</span>
                    <button onClick={() => setShowSplitPanel(!showSplitPanel)} style={{ background: showSplitPanel ? '#1e3a8a' : '#0f172a', border: '1px solid #2563eb', color: '#3b82f6', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      👥 {showSplitPanel ? 'Close Split Workspace' : 'Link Friends & Split Cost'}
                    </button>
                  </div>

                  {showSplitPanel && (
                    <div style={{ background: '#090d16', border: '1px solid #2563eb', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>Relational Database Member Splitter</h3>
                      
                      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <input
                          type="email"
                          placeholder="Enter friend's registered login email address..."
                          value={friendSearchEmail}
                          onChange={(e) => setFriendSearchEmail(e.target.value)}
                          style={{ flex: 1, padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13 }}
                        />
                        <button onClick={handleSearchFriend} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '0 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                          🔍 Link Account
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                        {friendsList.map(f => (
                          <span key={f.clerk_id} style={{ background: '#1e293b', border: '1px solid #475569', color: '#cbd5e1', padding: '4px 10px', borderRadius: 20, fontSize: 11 }}>
                            👤 {f.display_name}
                          </span>
                        ))}
                      </div>

                      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 12, color: '#94a3b8' }}>Taxes / Sub-charges ($):</label>
                        <input type="number" value={extraCharges} onChange={(e) => setExtraCharges(e.target.value)} style={{ width: 80, padding: '5px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9' }} />
                      </div>

                      <button onClick={calculateLiveSplitMatrix} disabled={friendsList.length < 2 || calculatingSplit} style={{ width: '100%', padding: '10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {calculatingSplit && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
                        Compile Sync Balances
                      </button>

                      {splitResult && (
                        <div style={{ marginTop: 16, background: '#020817', border: '1px solid #1e293b', borderRadius: 10, padding: 12 }}>
                          <h4 style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>Cross-Account Final Breakdown Statement</h4>
                          {Object.entries(splitResult).map(([uid, bill]: any) => (
                            <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px solid #1e293b' }}>
                              <span style={{ color: '#cbd5e1' }}>{bill.display_name}:</span>
                              <span style={{ color: '#f1f5f9', fontWeight: 700 }}>${bill.total?.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {parsedItems.length > 0 && (
                    <div style={{ background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {parsedItems.map((item, i) => {
                            const cs = getCategoryStyle(item.category);
                            const currentAssignments = itemAssignments[i] || [];
                            return (
                              <React.Fragment key={i}>
                                <tr>
                                  <td style={{ padding: '11px 16px', fontSize: 13, color: '#cbd5e1' }}>{item.name}</td>
                                  <td style={{ padding: '11px 16px' }}><span style={{ background: cs.bg, color: cs.text, padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{item.category}</span></td>
                                  <td style={{ padding: '11px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600 }}>${item.price.toFixed(2)}</td>
                                </tr>
                                {showSplitPanel && (
                                  <tr style={{ background: 'rgba(59,130,246,0.02)', borderBottom: '1px solid #1e293b' }}>
                                    <td colSpan={3} style={{ padding: '4px 16px 12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 10, color: '#475569' }}>SPLIT WITH:</span>
                                        {friendsList.map(f => {
                                          const active = currentAssignments.includes(f.clerk_id);
                                          return (
                                            <span key={f.clerk_id} onClick={() => { toggleUserAssignment(i, f.clerk_id); setSplitResult(null); }} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: active ? 'rgba(59,130,246,0.2)' : '#111', color: active ? '#60a5fa' : '#444', border: active ? '1px solid #2563eb' : '1px solid #222' }}>
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

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="action-btn" onClick={handleSave} disabled={saving || parsedItems.length === 0 || (showSplitPanel && !splitResult)} style={{ flex: 1, padding: '12px 20px', background: saving || parsedItems.length === 0 ? '#1e3a5f' : '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', cursor: 'pointer' }}>
                      {saving && <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                      {showSplitPanel ? 'Commit Shared Sync Save' : 'Save Receipt'}
                    </button>
                    <button className="action-btn" onClick={() => { setIsEditing(false); setReceipt(null); setSelectedFile(null); setParsedItems([]); setShowSplitPanel(false); setSplitResult(null); }} style={{ padding: '12px 18px', background: 'transparent', color: '#64748b', border: '1px solid #1e293b', borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY VIEW ── */}
          {view === 'history' && (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Receipt History Ledger</h2>
                <p style={{ color: '#64748b', fontSize: 14 }}>Displaying receipts belonging to or shared dynamically with your account.</p>
              </div>

              {historyLoading && <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>Loading records…</div>}

              {!historyLoading && history.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed #1e293b', borderRadius: 14 }}>
                  <p style={{ color: '#64748b', fontWeight: 600 }}>No record history linked to this node.</p>
                </div>
              )}

              {history.map((r) => (
                <div key={r.id} style={{ background: '#0a0f1a', border: r.is_owner ? '1px solid #1e293b' : '1px solid #10b981', borderRadius: 14, marginBottom: 14, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ background: r.is_owner ? '#1e293b' : '#064e3b', color: r.is_owner ? '#94a3b8' : '#34d399', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                        {r.is_owner ? 'Owner' : `Shared by ${r.uploaded_by_name}`}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>
                        {new Date(r.created_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Your Share: ${r.amount_owed?.toFixed(2)}</span>
                    </div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {r.parsed_items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #0f172a' }}>
                          <td style={{ padding: '9px 18px', fontSize: 13, color: '#cbd5e1' }}>{item.name}</td>
                          <td style={{ padding: '9px 18px', textAlign: 'right', fontSize: 13, color: '#64748b' }}>${item.price.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* ── DASHBOARD VIEW ── */}
          {view === 'dashboard' && (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              <SpendingDashboard userId={user?.id || ''} />
            </div>
          )}
        </div>
      </SignedIn>
    </>
  );
}

export default App;