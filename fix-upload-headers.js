const fs = require('fs');
const filePath = 'components/upload/large-file-uploader.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Remove Content-Type header from the upload request
const oldCode = `      // Upload chunk to S3 presigned URL
      const uploadResponse = await fetch(url, {
        method: "PUT",
        body: chunk,
        signal: controller.signal,
        headers: {
          "Content-Type": fileData.type || "application/octet-stream",
        },
      })`;

const newCode = `      // Upload chunk to S3 presigned URL
      // IMPORTANT: Do not add Content-Type header for multipart uploads
      // The presigned URL does not include it, so adding it causes signature mismatch
      const uploadResponse = await fetch(url, {
        method: "PUT",
        body: chunk,
        signal: controller.signal,
      })`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('✓ Fixed: Removed Content-Type header from upload request');
} else {
  console.log('✗ Pattern not found - file may have been modified');
  console.log('Looking for alternative patterns...');

  // Try to find the fetch call with headers
  if (content.includes('headers: {') && content.includes('"Content-Type"')) {
    console.log('Found Content-Type header in file');
  }
  process.exit(1);
}
