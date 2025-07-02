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
