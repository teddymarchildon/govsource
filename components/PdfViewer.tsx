'use client';

import React, { useState, useEffect } from 'react';
import { getStoragePublicUrl } from '@/services/api';
import LoadingIndicator from './ui/LoadingIndicator';

interface PdfViewerProps {
  pdfUrl?: string;
  storagePath?: string;
  storageBucket?: string;
  className?: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ storagePath, storageBucket, className }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<'iframe' | 'browser' | 'download'>('iframe');

  useEffect(() => {
    // Enhanced mobile detection
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /mobile|android|iphone|ipad|phone|blackberry|opera mini|windows phone/.test(userAgent);
      const isSmallScreen = window.innerWidth <= 768;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      setIsMobile(isMobileDevice || isSmallScreen || isTouchDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchStorageUrl = async () => {
      if (storagePath && storageBucket) {
        try {
          const publicUrl = await getStoragePublicUrl(storageBucket, storagePath);
          setUrl(publicUrl);
        } catch (error) {
          console.error('Error fetching storage URL:', error);
          setError('Failed to load PDF from storage');
        }
      }
    };

    if (!url && storagePath && storageBucket) {
      fetchStorageUrl();
    } else {
      setUrl(url || null);
    }
  }, [url, storagePath, storageBucket]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setError('Failed to load PDF document');
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 bg-gray-100 rounded-lg">
        <p className="text-red-500">{error}</p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Open PDF in new tab
          </a>
        )}
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 bg-gray-100 rounded-lg">
        <p className="text-gray-500">No PDF document available</p>
      </div>
    );
  }

  // For mobile devices, use a different approach to ensure all pages are visible
  if (isMobile) {
    return (
      <div className={`h-full ${className || ''} relative`}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <LoadingIndicator size="large" />
          </div>
        )}
        
        {/* Mobile-optimized PDF viewer */}
        <div className="w-full h-full flex flex-col">
          {/* Header with view mode options */}
          <div className="flex justify-between items-center p-3 bg-gray-50 border-b">
            <span className="text-sm text-gray-600">PDF Document</span>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('iframe')}
                className={`px-2 py-1 text-xs rounded ${
                  viewMode === 'iframe' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                View
              </button>
              <button
                onClick={() => setViewMode('browser')}
                className={`px-2 py-1 text-xs rounded ${
                  viewMode === 'browser' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                Browser
              </button>
              <button
                onClick={() => setViewMode('download')}
                className={`px-2 py-1 text-xs rounded ${
                  viewMode === 'download' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                Download
              </button>
            </div>
          </div>
          
          {/* Content area based on view mode */}
          <div className="flex-1 relative">
            {viewMode === 'iframe' && (
              <iframe
                src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&page=1&zoom=page-fit`}
                className="w-full h-full border-0"
                title="PDF Viewer"
                onLoad={handleLoad}
                onError={handleError}
                style={{
                  minHeight: '100%',
                  height: '100%',
                  width: '100%'
                }}
              />
            )}
            
            {viewMode === 'browser' && (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-50">
                <div className="text-center">
                  <p className="text-gray-600 mb-4">Open PDF in your browser for full functionality</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Open PDF in Browser
                  </a>
                  <p className="text-xs text-gray-500 mt-2">
                    This will open the PDF in a new tab where you can view all pages
                  </p>
                </div>
              </div>
            )}
            
            {viewMode === 'download' && (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-50">
                <div className="text-center">
                  <p className="text-gray-600 mb-4">Download the PDF to view on your device</p>
                  <a
                    href={url}
                    download
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                  >
                    Download PDF
                  </a>
                  <p className="text-xs text-gray-500 mt-2">
                    Use your device's PDF viewer for the best experience
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Mobile navigation hint */}
          <div className="p-2 bg-gray-50 border-t text-center">
            <p className="text-xs text-gray-500">
              {viewMode === 'iframe' && 'Swipe or scroll to navigate through all pages'}
              {viewMode === 'browser' && 'Browser view provides full PDF functionality'}
              {viewMode === 'download' && 'Download for offline viewing'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Desktop version (original implementation)
  return (
    <div className={`h-full ${className || ''} relative`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <LoadingIndicator size="large" />
        </div>
      )}
      <iframe
        src={url}
        className="w-full h-full border-0 rounded-lg"
        title="PDF Viewer"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
};

export default PdfViewer;
