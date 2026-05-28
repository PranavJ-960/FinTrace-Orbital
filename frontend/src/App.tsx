import React, { useState } from 'react';
import { SignedIn, SignedOut, SignIn, UserButton } from '@clerk/clerk-react';

interface ReceiptData {
  rawText: string;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  
  // State to hold the editable raw text block
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a receipt image first!');
      return;
    }

    setLoading(true);
    setReceipt(null);
    setIsEditing(false);

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
      
      // Captures string output from your backend pipeline
      const extractedText = data.text || (typeof data === 'string' ? data : JSON.stringify(data, null, 2));

      setReceipt({
        rawText: extractedText
      });
      setIsEditing(true); 

    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error: Could not connect to backend or process image.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!receipt) return;

    try {
      // Milestone 2: This will push the manually cleaned text block to PostgreSQL
      console.log('Saving cleaned raw text to database:', receipt.rawText);
      
      alert('Receipt text updated and saved successfully!');
      setIsEditing(false); 
    } catch (error) {
      console.error('Error saving receipt:', error);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '650px', margin: '0 auto' }}>
      
      {/* SCENARIO A: Signed Out */}
      <SignedOut>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '50px' }}>
          <h2>Welcome to FinTrace</h2>
          <p>Please sign in to access the OCR receipt manager.</p>
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      {/* SCENARIO B: Signed In */}
      <SignedIn>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h2>FinTrace — Receipt Text Editor</h2>
          <UserButton />
        </header>
        
        <p>Upload a receipt image to view and directly correct the text output pipeline.</p>
        
        {/* Upload Container */}
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

        {/* DIRECT TEXT EDITING BLOCK */}
        {isEditing && receipt && (
          <div style={{ backgroundColor: '#f9f9f9', padding: '25px', borderRadius: '8px', border: '1px solid #ddd', marginTop: '25px' }}>
            <h3 style={{ marginTop: 0 }}>Correct Extracted Text</h3>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
              Click anywhere inside the box below to edit words, fix numbers, or delete messy lines directly.
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
      </SignedIn>

    </div>
  );
}

export default App;