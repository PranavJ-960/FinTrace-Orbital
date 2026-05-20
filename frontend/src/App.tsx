import React, { useState } from 'react';

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
      // Points to your local FastAPI server port (adjust to 8000 or your specific backend port)
      const response = await fetch('http://127.0.0.1:8000/upload', {
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
      <h2>FinTrace — Receipt OCR Upload (Milestone 1)</h2>
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
    </div>
  );
}

export default App;