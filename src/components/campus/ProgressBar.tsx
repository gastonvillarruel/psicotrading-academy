import React from 'react';

interface ProgressBarProps {
  percent: number;
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function ProgressBar({
  percent,
  className = '',
  showText = false,
  size = 'md',
}: ProgressBarProps) {
  const cappedPercent = Math.max(0, Math.min(100, percent));
  
  const heightMap = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3.5',
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-grow bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`${heightMap[size]} bg-gradient-to-r from-teal-600 to-indigo-600 rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${cappedPercent}%` }}
          />
        </div>
        {showText && (
          <span className="text-xs font-bold text-slate-700 min-w-[32px] text-right">
            {Math.round(cappedPercent)}%
          </span>
        )}
      </div>
    </div>
  );
}
