import React, { useState } from 'react';
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

interface ReceiptRecord {
  id: number;
  raw_text: string;
  parsed_items: ParsedItem[];
  created_at: string;
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

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const text = data.text || JSON.stringify(data, null, 2);
      setReceipt({ rawText: text });
      setIsEditing(true);
      await handleParse(text);
    } catch {
      showToast('Could not process the image. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!receipt || !user) return;
    setSaving(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, raw_text: receipt.rawText, parsed_items: parsedItems }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      showToast(`Receipt #${data.receipt_id} saved!`);
      setIsEditing(false);
      setReceipt(null);
      setSelectedFile(null);
      setParsedItems([]);
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
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
        .upload-zone:hover { border-color: #3b82f6 !important; background: rgba(59,130,246,0.05) !important; }
        .nav-btn:hover { background: #1e293b !important; color: #f1f5f9 !important; }
        .action-btn:hover { opacity: 0.88; }
        .receipt-row:hover { background: rgba(255,255,255,0.03) !important; }
        textarea:focus { outline: none; border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.15) !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: 10, padding: '12px 18px',
          color: '#f1f5f9', fontSize: 14, fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'slideIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}

      <SignedOut>
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🧾</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.02em' }}>FinTrace</h1>
            <p style={{ color: '#64748b', marginTop: 6, fontSize: 15 }}>Scan receipts. Track spending. Stay in control.</p>
          </div>
          <SignIn routing="hash" appearance={{
            variables: { colorBackground: '#0f172a', colorText: '#f1f5f9', colorPrimary: '#3b82f6', colorInputBackground: '#1e293b', colorInputText: '#f1f5f9' }
          }} />
        </div>
      </SignedOut>

      <SignedIn>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px 80px' }}>

          {/* Header */}
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 0 16px', borderBottom: '1px solid #1e293b', marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>🧾</span>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#f1f5f9' }}>FinTrace</span>
            </div>
            <UserButton appearance={{ variables: { colorBackground: '#0f172a', colorText: '#f1f5f9' } }} />
          </header>

          {/* Nav */}
          <nav style={{
            display: 'flex', gap: 4,
            background: '#0f172a', borderRadius: 12, padding: 4,
            border: '1px solid #1e293b', marginBottom: 28,
          }}>
            {NAV_ITEMS.map(({ id, label, icon }) => (
              <button
                key={id}
                className="nav-btn"
                onClick={() => handleNavClick(id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 12px', border: 'none', borderRadius: 9, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                  background: view === id ? '#1e293b' : 'transparent',
                  color: view === id ? '#f1f5f9' : '#64748b',
                  fontFamily: 'inherit',
                }}
              >
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
                  <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
                    Take a photo or upload an image — we'll extract and categorise every item automatically.
                  </p>

                  <label
                    className="upload-zone"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 12, padding: '40px 24px',
                      border: '2px dashed #1e293b', borderRadius: 14, cursor: 'pointer',
                      background: '#0a0f1a', transition: 'all 0.2s', textAlign: 'center',
                    }}
                  >
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                    <div style={{ fontSize: 36 }}>{selectedFile ? '✅' : '📷'}</div>
                    <div>
                      <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>
                        {selectedFile ? selectedFile.name : 'Click to choose a receipt image'}
                      </div>
                      {!selectedFile && (
                        <div style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>JPG, PNG, WEBP supported</div>
                      )}
                    </div>
                    {selectedFile && (
                      <div style={{ color: '#64748b', fontSize: 12 }}>Click to change file</div>
                    )}
                  </label>

                  {selectedFile && (
                    <button
                      className="action-btn"
                      onClick={handleUpload}
                      disabled={loading}
                      style={{
                        marginTop: 16, width: '100%', padding: '12px 20px',
                        background: loading ? '#1e3a5f' : '#2563eb',
                        color: '#fff', border: 'none', borderRadius: 10,
                        fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
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
                      <p style={{ color: '#64748b', fontSize: 13, marginTop: 3 }}>Fix any OCR errors, then re-parse to update items.</p>
                    </div>
                    <button
                      onClick={() => { setIsEditing(false); setReceipt(null); setSelectedFile(null); setParsedItems([]); }}
                      style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 20, lineHeight: 1, fontFamily: 'inherit' }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* OCR text area */}
                  <div style={{ background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Raw OCR Text</span>
                      <button
                        className="action-btn"
                        onClick={handleReParse}
                        disabled={reParsing}
                        style={{
                          background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
                          padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          cursor: reParsing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
                        }}
                      >
                        {reParsing && <span style={{ width: 10, height: 10, border: '1.5px solid #475569', borderTop: '1.5px solid #94a3b8', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                        {reParsing ? 'Re-parsing…' : '↻ Re-parse'}
                      </button>
                    </div>
                    <textarea
                      rows={14}
                      value={receipt.rawText}
                      onChange={(e) => setReceipt({ rawText: e.target.value })}
                      style={{
                        width: '100%', padding: '14px', border: 'none',
                        background: 'transparent', color: '#94a3b8',
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontSize: 12.5, lineHeight: 1.7, resize: 'vertical',
                        transition: 'border 0.2s, box-shadow 0.2s',
                      }}
                    />
                  </div>

                  {/* Parsed items table */}
                  {parsedItems.length > 0 && (
                    <div style={{ background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
                          {parsedItems.length} item{parsedItems.length !== 1 ? 's' : ''} found
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>${estimatedTotal.toFixed(2)}</span>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #1e293b' }}>
                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Item</th>
                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Category</th>
                            <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedItems.map((item, i) => {
                            const cs = getCategoryStyle(item.category);
                            return (
                              <tr key={i} className="receipt-row" style={{ borderBottom: '1px solid #0f172a', transition: 'background 0.1s' }}>
                                <td style={{ padding: '11px 16px', fontSize: 13, color: '#cbd5e1' }}>{item.name}</td>
                                <td style={{ padding: '11px 16px' }}>
                                  <span style={{
                                    background: cs.bg, color: cs.text,
                                    padding: '3px 9px', borderRadius: 6,
                                    fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {item.category || 'Other'}
                                  </span>
                                </td>
                                <td style={{ padding: '11px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>
                                  ${item.price.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {parsedItems.length === 0 && !reParsing && (
                    <div style={{ textAlign: 'center', padding: '24px 16px', color: '#475569', fontSize: 13 }}>
                      No items detected. Try editing the text above and re-parsing.
                    </div>
                  )}

                  {/* Save / cancel */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="action-btn"
                      onClick={handleSave}
                      disabled={saving || parsedItems.length === 0}
                      style={{
                        flex: 1, padding: '12px 20px',
                        background: saving || parsedItems.length === 0 ? '#1e3a5f' : '#2563eb',
                        color: '#fff', border: 'none', borderRadius: 10,
                        fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      {saving && <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                      {saving ? 'Saving…' : 'Save Receipt'}
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => { setIsEditing(false); setReceipt(null); setSelectedFile(null); setParsedItems([]); }}
                      style={{
                        padding: '12px 18px', background: 'transparent',
                        color: '#64748b', border: '1px solid #1e293b', borderRadius: 10,
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.15s', fontFamily: 'inherit',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY VIEW ── */}
          {view === 'history' && (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Receipt History</h2>
                <p style={{ color: '#64748b', fontSize: 14 }}>All your saved receipts in one place.</p>
              </div>

              {historyLoading && (
                <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>Loading…</div>
              )}

              {!historyLoading && history.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '60px 20px',
                  border: '1px dashed #1e293b', borderRadius: 14,
                }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🧾</div>
                  <p style={{ color: '#64748b', fontWeight: 600 }}>No receipts saved yet</p>
                  <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>Upload your first receipt to see it here.</p>
                </div>
              )}

              {history.map((r) => {
                const total = (r.parsed_items || []).reduce((s, i) => s + i.price, 0);
                return (
                  <div key={r.id} style={{
                    background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 14,
                    marginBottom: 14, overflow: 'hidden',
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px 18px', borderBottom: r.parsed_items?.length ? '1px solid #1e293b' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          background: '#1e293b', color: '#64748b',
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                        }}>
                          #{r.id}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>
                          {new Date(r.created_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
                        ${total.toFixed(2)}
                      </span>
                    </div>

                    {r.parsed_items && r.parsed_items.length > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {r.parsed_items.map((item, i) => {
                            const cs = getCategoryStyle(item.category);
                            return (
                              <tr key={i} className="receipt-row" style={{ borderBottom: i < r.parsed_items.length - 1 ? '1px solid #0f172a' : 'none', transition: 'background 0.1s' }}>
                                <td style={{ padding: '9px 18px', fontSize: 13, color: '#cbd5e1' }}>{item.name}</td>
                                <td style={{ padding: '9px 18px' }}>
                                  <span style={{
                                    background: cs.bg, color: cs.text,
                                    padding: '2px 8px', borderRadius: 6,
                                    fontSize: 11, fontWeight: 600,
                                  }}>
                                    {item.category || 'Other'}
                                  </span>
                                </td>
                                <td style={{ padding: '9px 18px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                                  ${item.price.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ padding: '14px 18px', fontSize: 13, color: '#475569' }}>No items extracted.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── DASHBOARD VIEW ── */}
          {view === 'dashboard' && (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Spending Dashboard</h2>
                <p style={{ color: '#64748b', fontSize: 14 }}>An overview of where your money goes.</p>
              </div>
              <SpendingDashboard userId={user?.id || ''} />
            </div>
          )}

        </div>
      </SignedIn>
    </>
  );
}

export default App;