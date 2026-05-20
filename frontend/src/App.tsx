import React, { useState } from 'react';
// 1. Import Clerk's helper components
import { SignedIn, SignedOut, SignIn, UserButton } from '@clerk/clerk-react';

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrResult, setOcrResult] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

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
    setOcrResult('');

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
      setOcrResult(data.text || JSON.stringify(data, null, 2)); 
    } catch (error) {
      console.error('Error uploading file:', error);
      setOcrResult('Error: Could not connect to backend or process image.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      
      {/* SCENARIO A: The user is NOT logged in -> Show the beautiful login panel */}
      <SignedOut>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '50px' }}>
          <h2>Welcome to FinTrace</h2>
          <p>Please sign in to access the OCR receipt manager.</p>
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      {/* SCENARIO B: The user IS logged in -> Show the OCR application */}
      <SignedIn>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h2>FinTrace — Receipt OCR Upload</h2>
          {/* Clerk's built-in avatar dropdown that handles profiles and sign-outs */}
          <UserButton />
        </header>
        
        <p>Upload a photo of a local receipt to test the extraction pipeline.</p>
        
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

        {ocrResult && (
          <div>
            <h3>Extracted Raw Text Output:</h3>
            <pre style={{ backgroundColor: '#f4f4f4', padding: '15px', borderRadius: '5px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {ocrResult}
            </pre>
          </div>
        )}
      </SignedIn>

    </div>
  );
}

export default App;