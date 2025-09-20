import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, XIcon } from 'lucide-react';

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://contractly-nhu5.onrender.com";

const Index = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const [showResults, setShowResults] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (isValidFileType(file)) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Please upload a PDF or DOCX file only.');
      }
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (isValidFileType(file)) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Please upload a PDF or DOCX file only.');
      }
    }
  };

  const isValidFileType = (file) => {
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    return validTypes.includes(file.type) || file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');
  };

  const handleAnalyze = async () => {
    if (selectedFile) {
      setIsAnalyzing(true);
      setError(null);
      setAnalysisResults(null);
      setShowResults(false);
      
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        console.log("Sending request to server...");
        
        const response = await fetch(`${API_BASE}/analyze`, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        console.log("Server response:", data);
        
        if (!response.ok) {
          throw new Error(data.error || 'Analysis failed');
        }

        // Handle non-contract documents
        if (data.isContract === false) {
          setError(data.analysis);
          setAnalysisResults(null);
          setShowResults(false);
        } else {
          // Use the entire data object, not data.analysis
          setAnalysisResults(data);
          setShowResults(true);
        }
      } catch (error) {
        console.error("Analysis error:", error);
        setError(
          error.message || "Failed to analyze contract. Please try again."
        );
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const openFileDialog = () => {
    fileInputRef.current && fileInputRef.current.click();
  };

  const removeFile = () => {
    setSelectedFile(null);
    setError(null);
    setAnalysisResults(null);
    setShowResults(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatAnalysisText = (analysis) => {
    // Define all possible sections with default values
    const sections = {
      "Key Obligations": analysis["Key Obligations"] || ["No key obligations identified in this contract."],
      "Renewal Dates and Deadlines": analysis["Renewal Dates and Deadlines"] || [],
      "Risks and Penalties": analysis["Risks and Penalties"] || [],
      "Auto-Renewal Clauses": analysis["Auto-Renewal Clauses"] || [],
      "Recommendations for SMEs": analysis["Recommendations for SMEs"] || ["No specific recommendations available."]
    };

    // Render all sections
    return Object.entries(sections).map(([heading, content], index) => (
      <div key={index} className="mb-6">
        <h3 className="text-lg font-bold text-purple-900 mb-3">
          {heading}
        </h3>
        
        {Array.isArray(content) && content.length > 0 ? (
          <div className="">
            {content.map((item, itemIndex) => {
              // Check if item is an object (for sections with risk ratings)
              if (typeof item === 'object' && item !== null) {
                return (
                  <div key={itemIndex} className="mb-4 p-3 bg-white rounded-lg border border-gray-200">
                    <p className="text-sm md:text-base text-gray-700 mb-2">{item.point}</p>
                    {item.riskRating && (
                      <div className="flex items-center text-xs mb-2">
                        <span className="font-medium mr-2">Risk Rating:</span>
                        <span className={`px-2 py-1 rounded ${
                          item.riskRating.toLowerCase().includes('high') 
                            ? 'bg-red-100 text-red-800 border border-red-200' 
                            : item.riskRating.toLowerCase().includes('medium')
                              ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                              : 'bg-green-100 text-green-800 border border-green-200'
                        }`}>
                          {item.riskRating}
                        </span>
                      </div>
                    )}
                    {item.reason && (
                      <div className="text-xs text-gray-500 italic">
                        <span className="font-medium">Reason: </span>
                        {item.reason}
                      </div>
                    )}
                  </div>
                );
              } else {
                // For simple string items (like in Key Obligations and Recommendations)
                return (
                  <div key={itemIndex} className="mb-2">
                    <p className="text-sm md:text-base text-gray-700">• {item}</p>
                  </div>
                );
              }
            })}
          </div>
        ) : (
          <p className="ml-4 text-gray-500 italic">No details found for this section.</p>
        )}
      </div>
    ));
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-2">
          <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-b from-[#882cd3] to-[#8680fe] bg-clip-text text-transparent mb-2 md:mb-6 pb-2">
            Contractly
          </h1>
          <p className="md:text-lg text-lg max-w-2xl mx-auto">
            Upload your contract documents and get instant AI-powered analysis for key terms, risks, and insights.
          </p>
        </div>

        {/* Error or Warning */}
        {error && (
          <div className="w-11/12 md:w-3/6 mx-auto mb-6">
            <div
              className={`px-4 py-3 rounded-xl flex items-center ${
                error.startsWith("⚠️") || error.startsWith("This doesn't look like a contract")
                  ? "bg-yellow-100 border border-yellow-400 text-yellow-700"
                  : "bg-red-100 border border-red-400 text-red-700"
              }`}
            >
              <AlertCircle className="w-5 h-5 mr-2" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Main Upload Section */}
        <div className="w-11/12 md:w-3/6 mx-auto">
          <div className="bg-white rounded-2xl shadow-strong p-6 mb-8">
            {/* Upload Area */}
            <div
              className={`
                relative border-2 border-dashed border-[#7c5c935e] rounded-xl p-12 text-center transition-all duration-300 cursor-pointer
                ${isDragOver 
                  ? 'border-primary bg-gradient-upload scale-[1.02]' 
                  : selectedFile 
                    ? 'border-accent bg-gradient-upload' 
                    : 'border-border hover:border-primary hover:bg-gradient-upload hover:scale-[1.01]'
                }
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={openFileDialog}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {selectedFile ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <CheckCircle className="w-16 h-16 text-purple-900" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">File Selected</h3>
                    <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                      <FileText className="w-5 h-5" />
                      <span className="font-medium">{selectedFile.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile();
                    }}
                    className="text-sm px-3 py-1 rounded-xl bg-[#cf8cff5e]"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <div className={`
                      p-4 rounded-full transition-all duration-300
                      ${isDragOver ? 'bg-primary text-white scale-110' : 'bg-secondary text-primary'}
                    `}>
                      <Upload className="w-12 h-12 text-purple-900" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {isDragOver ? 'Drop your contract here' : 'Upload Contract Document'}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Drag and drop your file here, or click to browse
                    </p>
                    <div className="inline-flex bg-[#cf8cff5e] items-center space-x-2 bg-secondary px-3 py-1 rounded-full text-sm">
                      <AlertCircle className="w-4 h-4 text-muted-foreground" />
                      <span className="">Supported: PDF, DOCX</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Analyze Button */}
            {selectedFile && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className={`
                    inline-flex items-center space-x-3 md:px-8 md:py-4 px-6 py-3 md:rounded-xl rounded:lg font-semibold md:text-lg text-base transition-all duration-300 shadow-medium
                    ${isAnalyzing 
                      ? 'bg-gray-400 cursor-not-allowed text-white' 
                      : 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:shadow-strong hover:scale-105 active:scale-95'
                    }
                  `}
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Analyzing Contract...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      <span>Analyze Contract</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Features Preview */}
          <div className="grid md:grid-cols-3 w-4/6 mx-auto md:w-full gap-10 text-center">
            <div className="bg-gradient-to-tl from-purple-300 to-blue-200 backdrop-blur rounded-xl p-4 shadow-lg shadow-[#5f3c68d1]">
              <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-3">
                <FileText className="w-6 h-6 text-purple-900" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Key Terms</h3>
              <p className="text-sm text-muted-foreground">Extract and highlight important contract terms and clauses</p>
            </div>
            
            <div className="bg-gradient-to-tl from-blue-300 to-purple-200 backdrop-blur rounded-xl p-4 shadow-lg shadow-[#5f3c68d1]">
              <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-6 h-6 text-purple-900" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Risk Analysis</h3>
              <p className="text-sm text-muted-foreground">Identify potential risks and problematic clauses</p>
            </div>
            
            <div className="bg-gradient-to-tl from-purple-300 to-blue-200 backdrop-blur rounded-xl p-4 shadow-lg shadow-[#5f3c68d1]">
              <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-purple-900" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Insights</h3>
              <p className="text-sm text-muted-foreground">Get AI-powered recommendations and insights</p>
            </div>
          </div>
        </div>

        {showResults && analysisResults && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-full md:max-w-4xl w-full max-h-[80vh] overflow-y-auto relative">
              {/* Close button */}
              <button 
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 z-10 bg-white rounded-full p-1 shadow-sm"
                onClick={() => {
                  setShowResults(false);
                  setAnalysisResults(null);
                }}
              >
                <XIcon className="w-6 h-6" />
              </button>

              {/* Header */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-purple-900 mb-2">Contract Analysis Results</h2>
                <div className="w-20 h-1 bg-gradient-to-r from-purple-400 to-blue-400 mx-auto rounded-full"></div>
              </div>

              {/* Contract Summary Card */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 mb-6 border border-purple-200">
                <h3 className="text-lg font-semibold text-purple-800 mb-3">Contract Summary</h3>
                <p className="text-gray-700">
                  Summarized contract terms in the document uploaded.
                </p>
              </div>

              {/* Analysis Content */}
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <div className="space-y-6">
                  {formatAnalysisText(analysisResults)}
                </div>
              </div>

              {/* Disclaimer */}
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-700">
                    <strong>Disclaimer:</strong> This analysis is for informational purposes only and does not constitute legal advice. 
                    Professional legal counsel should be consulted to ensure compliance with all applicable laws and regulations.
                  </p>
                </div>
              </div>

              <div className="mt-6 text-sm text-gray-500 text-center">
                <p>💡 Analysis powered by Google Gemini AI</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;