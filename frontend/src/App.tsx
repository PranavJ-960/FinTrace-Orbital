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

function App() {
  const { user } = useUser();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [reParsing, setReParsing] = useState<boolean>(false);
  const [view, setView] = useState<'upload' | 'history'>('upload');
  const [history, setHistory] = useState<ReceiptRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleParse = async (text: string) => {
    try {
      const parseResponse = await fetch('http://127.0.0.1:8000/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: text }),
      });
      const parseData = await parseResponse.json();
      setParsedItems(parseData.items || []);
    } catch (error) {
      console.error('Parse error:', error);
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
    if (!selectedFile) {
      alert('Please select a receipt image first!');
      return;
    }

    setLoading(true);
    setReceipt(null);
    setIsEditing(false);
    setParsedItems([]);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to extract text from receipt.');
      }

      const data = await response.json();
      const extractedText = data.text || (typeof data === 'string' ? data : JSON.stringify(data, null, 2));

      setReceipt({ rawText: extractedText });
      setIsEditing(true);
      await handleParse(extractedText);

    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error: Could not connect to backend or process image.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!receipt || !user) return;

    try {
      const response = await fetch('http://127.0.0.1:8000/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          raw_text: receipt.rawText,
          parsed_items: parsedItems,
        }),
      });

      if (!response.ok) throw new Error('Save failed');

      const data = await response.json();
      alert(`Receipt saved! ID: ${data.receipt_id}`);
      setIsEditing(false);

    } catch (error) {
      console.error('Error saving receipt:', error);
      alert('Error: Could not save receipt.');
    }
  };

  const fetchHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/receipts?user_id=${user.id}`);
      const data = await response.json();
      setHistory(data.receipts || []);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '650px', margin: '0 auto' }}>

      <SignedOut>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '50px' }}>
          <h2>Welcome to FinTrace</h2>
          <p>Please sign in to access the OCR receipt manager.</p>
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      <SignedIn>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>FinTrace — Receipt Manager</h2>
          <UserButton />
        </header>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
          <button
            onClick={() => setView('upload')}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: view === 'upload' ? '#0070f3' : '#eee',
              color: view === 'upload' ? 'white' : '#333',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Upload
          </button>
          <button
            onClick={() => { setView('history'); fetchHistory(); }}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: view === 'history' ? '#0070f3' : '#eee',
              color: view === 'history' ? 'white' : '#333',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            History
          </button>
          <button
            onClick={() => setView('dashboard')}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: view === 'dashboard' ? '#0070f3' : '#eee',
              color: view === 'dashboard' ? 'white' : '#333',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Dashboard
          </button>
        </div>

        {view === 'upload' && (
          <>
            <p>Upload a receipt image to view and directly correct the text output pipeline.</p>

            <div style={{ margin: '20px 0', border: '1px dashed #ccc', padding: '20px', borderRadius: '8px' }}>
              <input type="file" accept="image/*" onChange={handleFileChange} />
              {selectedFile && (
                <button
                  onClick={handleUpload}
                  disabled={loading}
                  style={{ marginLeft: '10px', padding: '6px 12px', cursor: 'pointer' }}
                >
                  {loading ? 'Processing OCR...' : 'Upload & Parse'}
                </button>
              )}
            </div>

            {isEditing && receipt && (
              <div style={{ backgroundColor: '#f9f9f9', padding: '25px', borderRadius: '8px', border: '1px solid #ddd', marginTop: '25px' }}>
                <h3 style={{ marginTop: 0 }}>Correct Extracted Text</h3>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
                  Edit the text below to fix any OCR errors, then click Re-Parse to update the item table.
                </p>

                <textarea
                  rows={18}
                  value={receipt.rawText}
                  onChange={(e) => setReceipt({ rawText: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid #bbb',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    boxSizing: 'border-box',
                    resize: 'vertical'
                  }}
                />

                <div style={{ marginTop: '8px' }}>
                  <button
                    onClick={handleReParse}
                    disabled={reParsing}
                    style={{
                      backgroundColor: '#f0f0f0',
                      color: '#333',
                      border: '1px solid #ccc',
                      padding: '6px 14px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    {reParsing ? 'Re-Parsing...' : '↻ Re-Parse Items'}
                  </button>
                </div>

                {(parsedItems || []).length > 0 && (
                  <div style={{ marginTop: '20px' }}>
                    <h4 style={{ marginBottom: '10px' }}>
                      Extracted Items ({(parsedItems || []).length}) — Est. Total: ${(parsedItems || []).reduce((sum, i) => sum + i.price, 0).toFixed(2)}
                    </h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left', backgroundColor: '#f0f0f0' }}>
                          <th style={{ padding: '8px' }}>Item</th>
                          <th style={{ padding: '8px' }}>Category</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(parsedItems || []).map((item, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px' }}>{item.name}</td>
                            <td style={{ padding: '8px' }}>
                              <span style={{ 
                                backgroundColor: '#e6f4ea', 
                                color: '#137333', 
                                padding: '2px 8px', 
                                borderRadius: '4px', 
                                fontSize: '12px',
                                fontWeight: 'bold'
                              }}>
                                {item.category || 'Other'}
                              </span>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleSave}
                    style={{
                      backgroundColor: '#0070f3',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                }}
                  >
                    Confirm & Save Changes
                  </button>

                  <button
                    onClick={() => setIsEditing(false)}
                    style={{
                      backgroundColor: '#fff',
                      color: '#333',
                      border: '1px solid #ccc',
                      padding: '10px 15px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {view === 'history' && (
          <div>
            <h3>Your Saved Receipts</h3>
            {historyLoading && <p>Loading history records...</p>}
            {!historyLoading && history.length === 0 && <p>No receipts saved yet.</p>}
            {history.map((r) => (
              <div key={r.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <strong>Receipt #{r.id}</strong>
                  <span style={{ fontSize: '13px', color: '#888' }}>{new Date(r.created_at).toLocaleString()}</span>
                </div>
                {r.parsed_items && r.parsed_items.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f0f0f0' }}>
                        <th style={{ padding: '6px', textAlign: 'left' }}>Item</th>
                        <th style={{ padding: '6px', textAlign: 'left' }}>Category</th>
                        <th style={{ padding: '6px', textAlign: 'right' }}>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(r.parsed_items || []).map((item, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '6px' }}>{item.name}</td>
                          <td style={{ padding: '6px' }}>
                            <span style={{ fontSize: '12px', color: '#555', fontStyle: 'italic' }}>
                              {item.category || 'Other'}
                            </span>
                          </td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #ddd', fontWeight: 'bold' }}>
                        <td colSpan={2} style={{ padding: '6px' }}>Total</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>
                          ${(r.parsed_items || []).reduce((sum, i) => sum + i.price, 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p style={{ fontSize: '13px', color: '#888' }}>No items extracted.</p>
                )}
              </div>
            ))}
          </div>
        )}

        {view === 'dashboard' && (
          <div>
            <SpendingDashboard userId={user?.id || ''} />
          </div>
        )}
      </SignedIn>
    </div>
  );
}

export default App;