import React from 'react';

export default function Footer() {
    return (
        <footer className="bg-white border-t border-slate-200 mt-12 py-8">
            <div className="max-w-7xl mx-auto px-4 text-center">
                <p className="text-slate-500 text-sm">
                    &copy; 2026 Ashutosh Services. All rights reserved.
                </p>
                <p className="text-slate-400 text-xs mt-2">
                    This tool is for clinical support and does not replace professional medical judgment.
                </p>
            </div>
        </footer>
    );
}