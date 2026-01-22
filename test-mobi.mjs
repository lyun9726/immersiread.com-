// Test script for MOBI parsing
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// Setup JSDOM globals
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.Blob = dom.window.Blob;

// Patch TextDecoder
const OriginalTextDecoder = TextDecoder;
global.TextDecoder = function (label, options) {
    let effectiveLabel = label;
    if (!label) {
        console.log('[Test] TextDecoder called with undefined label, using gb18030');
        effectiveLabel = 'gb18030';
    }
    try {
        return new OriginalTextDecoder(effectiveLabel, options);
    } catch (e) {
        console.log(`[Test] TextDecoder label "${effectiveLabel}" not supported, using gb18030`);
        return new OriginalTextDecoder('gb18030', options);
    }
};

// Import MOBI after patching
const { MOBI } = await import('@xincmm/foliate-js/mobi.js');

// Get test file path from command line
const testFile = process.argv[2];
if (!testFile) {
    console.log('Usage: node test-mobi.mjs <path-to-mobi-file>');
    process.exit(1);
}

console.log(`Testing MOBI file: ${testFile}`);

try {
    const buffer = fs.readFileSync(testFile);
    console.log(`File size: ${buffer.length} bytes`);

    const blob = new Blob([buffer]);
    blob.name = path.basename(testFile);

    console.log('Creating MOBI instance...');
    const book = new MOBI();

    console.log('Opening blob...');
    await book.open(blob);

    console.log('Book opened successfully!');
    console.log('Sections:', book.sections ? book.sections.length : 'undefined');
    console.log('Metadata:', JSON.stringify(book.metadata || {}, null, 2));

    if (book.sections && book.sections.length > 0) {
        console.log(`\nProcessing ${book.sections.length} sections...`);
        for (let i = 0; i < Math.min(3, book.sections.length); i++) {
            const section = book.sections[i];
            console.log(`\nSection ${i}: createDocument=${!!section.createDocument}`);
            if (section.createDocument) {
                const doc = await section.createDocument();
                console.log(`  doc.body exists: ${!!doc?.body}`);
                if (doc?.body) {
                    const text = doc.body.textContent?.slice(0, 200);
                    console.log(`  Preview: ${text}...`);
                }
            }
        }
    }

    console.log('\n✓ Test passed!');
} catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
}
