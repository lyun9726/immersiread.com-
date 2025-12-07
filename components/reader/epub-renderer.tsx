"use client"

import { useState, useRef, useEffect } from 'react';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { useResizeObserver } from 'usehooks-ts';
import { Loader2 } from 'lucide-react';

interface EpubRendererProps {
    url: string;
    location?: string | number;
    onLocationChange?: (loc: string) => void;
    scale?: number;
}

export function EpubRenderer({ url, location, onLocationChange, scale = 1.0 }: EpubRendererProps) {
    const [page, setPage] = useState<string>('');
    const renditionRef = useRef<any>(null);
    const [iframeHeight, setIframeHeight] = useState('100%');

    // Custom styles to inject into the EPUB iframe
    const ownStyles = {
        ...ReactReaderStyle,
        arrow: {
            ...ReactReaderStyle.arrow,
            color: 'hsl(var(--foreground))',
        },
    }

    return (
        <div className="h-[calc(100vh-140px)] w-full flex flex-col relative bg-background">
            <ReactReader
                url={url}
                location={location || null}
                locationChanged={(loc: string) => {
                    setPage(loc);
                    if (onLocationChange) onLocationChange(loc);
                }}
                getRendition={(rendition: any) => {
                    renditionRef.current = rendition;
                    // Inject basic style adjustments
                    rendition.themes.fontSize(`${100 * scale}%`);
                }}
                loadingView={
                    <div className="flex items-center justify-center p-8 w-full h-full">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                }
                readerStyles={ownStyles}
            />
        </div>
    );
}
