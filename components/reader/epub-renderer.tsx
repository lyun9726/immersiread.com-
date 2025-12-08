"use client"

import { useState, useRef, useEffect } from 'react';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { Loader2 } from 'lucide-react';
import { useReaderStore } from '@/lib/reader/stores/readerStore';

interface EpubRendererProps {
    url: string;
    scale?: number;
}

export function EpubRenderer({ url, scale = 1.0 }: EpubRendererProps) {
    const renditionRef = useRef<any>(null);
    const tocRef = useRef<any>(null);

    // Connect to store
    const epubLocation = useReaderStore(state => state.epubLocation);
    const setChapters = useReaderStore(state => state.setChapters);
    const setEpubLocation = (loc: string) => useReaderStore.setState({ epubLocation: loc });

    // Internal location state for ReactReader (it needs controlled component pattern)
    const [location, setLocation] = useState<string | null>(null);

    // Sync external epubLocation changes to internal location
    useEffect(() => {
        if (epubLocation && epubLocation !== location) {
            console.log('[EpubRenderer] Navigating to:', epubLocation);
            setLocation(epubLocation);
        }
    }, [epubLocation]);

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
                location={location}
                locationChanged={(loc: string) => {
                    setLocation(loc);
                    setEpubLocation(loc);
                }}
                tocChanged={(toc: any) => {
                    tocRef.current = toc;
                    // Convert ReactReader TOC to our chapter format
                    if (toc && toc.length > 0) {
                        const chapters = toc.map((item: any, index: number) => ({
                            id: `epub-toc-${index}`,
                            title: item.label,
                            order: index,
                            blockIds: [],
                            href: item.href, // Store the href for navigation
                        }));
                        console.log('[EpubRenderer] Extracted TOC:', chapters.length, 'chapters');
                        setChapters(chapters);
                    }
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
