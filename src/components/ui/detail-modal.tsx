"use client";

interface DetailModalProps {
  title: string;
  content: string;
  onClose: () => void;
}

export function DetailModal({ title, content, onClose }: DetailModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-brand-navy border border-gray-700 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-marfa font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="text-gray-300 font-marfa whitespace-pre-wrap">
          {content}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-brand-orange text-white px-4 py-2 rounded font-marfa hover:bg-brand-orange-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
