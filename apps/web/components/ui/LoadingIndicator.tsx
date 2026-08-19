'use client';

import React from 'react';

interface LoadingIndicatorProps {
  size?: 'small' | 'medium' | 'large';
}

export default function LoadingIndicator({ size = 'medium' }: LoadingIndicatorProps) {
  const sizeClasses = {
    small: 'w-4 h-4 border-2',
    medium: 'w-8 h-8 border-3',
    large: 'w-12 h-12 border-4'
  };

  return (
    <div className="flex justify-center items-center py-4">
      <div 
        className={`${sizeClasses[size]} rounded-full border-t-primary border-r-transparent border-b-primary border-l-transparent animate-spin`}
      ></div>
    </div>
  );
}
