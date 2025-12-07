"use client"

import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useResizeObserver } from 'usehooks-ts';
import { Loader2 } from 'lucide-react';

// Configure the worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFRendererProps {
    url: string;
    scale?: number;
}

export function PDFRenderer({ url, scale = 1.0 }: PDFRendererProps) {
    const [numPages, setNumPages] = useState<number>(0);
    const [width, setWidth] = useState<number>(600);
    const containerRef = (node: HTMLDivElement | null) => {
        if (node) {
            setWidth(node.getBoundingClientRect().width);
        }
    };

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
    }

    return (
        <div ref={containerRef} className="w-full h-full flex flex-col items-center overflow-y-auto bg-gray-100/50 p-4">
            <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                }
                className="flex flex-col gap-4"
            >
                {Array.from(new Array(numPages), (el, index) => (
                    <div key={`page_${index + 1}`} className="shadow-lg relative">
                        <Page
                            pageNumber={index + 1}
                            width={Math.min(width ? width - 48 : 600, 800) * scale}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            className="bg-white"
                        />
                        {/* Overlay Container would go here */}
                    </div>
                ))}
            </Document>
        </div>
    );
}
