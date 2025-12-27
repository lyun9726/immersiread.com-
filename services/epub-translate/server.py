"""
EPUB Bilingual Translation Service for Railway
Handles long-running EPUB translation tasks
"""

import os
import sys
import uuid
import threading
import requests
import zipfile
import re
import json
import io
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import tempfile
import shutil
import time
import logging
import boto3

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

def log(msg):
    """Print with flush for Railway logging"""
    print(f"[Server] {msg}", flush=True)
    logger.info(msg)

log("Starting EPUB Translate Service...")
log(f"Python version: {sys.version}")

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# In-memory job storage
jobs = {}

# CSS for bilingual display - using higher specificity to override defaults
BILINGUAL_CSS = """
/* Bilingual Book Maker Styles - High specificity */
.bbm-original {
  display: block !important;
}
.bbm-translated {
  display: block !important;
  background-color: rgba(59, 130, 246, 0.1);
  border-left: 3px solid rgba(59, 130, 246, 0.6);
  padding-left: 0.75em;
  margin-top: 0.5em;
  margin-bottom: 0.75em;
  font-style: normal;
}
/* Mode: Original - hide translations */
body.mode-original .bbm-translated,
html body.mode-original .bbm-translated {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  overflow: hidden !important;
}
/* Mode: Translation - hide originals */
body.mode-translation .bbm-original,
html body.mode-translation .bbm-original {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  overflow: hidden !important;
}
/* Mode: Bilingual - show both */
body.mode-bilingual .bbm-original,
body.mode-bilingual .bbm-translated {
  display: block !important;
  visibility: visible !important;
  height: auto !important;
}
"""

# JavaScript for mode switching - only listen for messages from parent
# Don't auto-init from localStorage as the frontend controls the mode
MODE_SWITCH_JS = """
//<![CDATA[
(function() {
  // Listen for mode change messages from parent window
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'bbm-mode-change') {
      var newMode = event.data.mode;
      document.body.className = document.body.className.replace(/mode-\\w+/g, '');
      document.body.classList.add('mode-' + newMode);
    }
  });
})();
//]]>
"""

def escape_html(text):
    """Escape HTML/XML entities"""
    if not text:
        return ""
    # Remove invalid XML characters
    text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)
    # Escape entities
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    text = text.replace('"', '&quot;')
    text = text.replace("'", '&#39;')
    return text

def translate_text(texts, api_key, base_url, model):
    """Translate a batch of texts using DeepSeek/OpenAI API"""
    if not texts:
        return []
    
    # Build prompt
    prompt = f"""Translate the following texts to Chinese. Return a JSON array with translations in the same order.

Texts to translate:
{json.dumps(texts, ensure_ascii=False)}

Return ONLY a JSON array of translated strings, like: ["翻译1", "翻译2", ...]"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a professional translator. Translate accurately and naturally."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3
    }
    
    try:
        response = requests.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=120
        )
        response.raise_for_status()
        
        result = response.json()
        content = result["choices"][0]["message"]["content"]
        
        # Parse JSON from response
        # Find JSON array in response
        match = re.search(r'\[[\s\S]*\]', content)
        if match:
            translations = json.loads(match.group())
            if len(translations) == len(texts):
                return translations
        
        log(f"Failed to parse translations, returning original")
        return texts
        
    except Exception as e:
        log(f"Translation error: {e}")
        return texts

def extract_texts_from_epub(epub_path, max_items=500):
    """Extract translatable texts from EPUB file"""
    texts = []
    file_map = {}  # Maps text index to (file_path, position)
    
    log(f"Opening EPUB: {epub_path}")
    
    with zipfile.ZipFile(epub_path, 'r') as zf:
        file_list = zf.namelist()
        log(f"EPUB contains {len(file_list)} files")
        
        html_files = [name for name in file_list if name.lower().endswith(('.html', '.xhtml', '.htm'))]
        log(f"Found {len(html_files)} HTML/XHTML files")
        
        for name in html_files:
            if len(texts) >= max_items:
                break
                
            content = zf.read(name).decode('utf-8', errors='ignore')
            log(f"Processing {name}, content length: {len(content)}")
            
            # Extract text from p, h1-h6, div, span tags
            tags_to_extract = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
            
            for tag in tags_to_extract:
                if len(texts) >= max_items:
                    break
                    
                # Use a more flexible regex pattern
                # Match <tag ...>content</tag> including multi-line content
                pattern = re.compile(
                    f'<{tag}(?:\\s[^>]*)?>([\\s\\S]*?)</{tag}>',
                    re.IGNORECASE | re.DOTALL
                )
                
                matches = list(pattern.finditer(content))
                if matches:
                    log(f"  Found {len(matches)} <{tag}> elements in {name}")
                
                for match in matches:
                    if len(texts) >= max_items:
                        break
                    
                    inner_html = match.group(1)
                    # Strip HTML tags to get plain text
                    text = re.sub(r'<[^>]*>', '', inner_html)
                    # Normalize whitespace
                    text = ' '.join(text.split()).strip()
                    
                    # Lower minimum to 5 characters (was 10)
                    if len(text) >= 5:
                        texts.append(text)
                        file_map[len(texts) - 1] = (name, match.start(), match.end(), tag, inner_html)
    
    log(f"Total texts extracted: {len(texts)}")
    return texts, file_map

def create_bilingual_epub(epub_path, translations, file_map, output_path):
    """Create bilingual EPUB with translations injected"""
    
    # Read original EPUB
    with zipfile.ZipFile(epub_path, 'r') as zf:
        files = {name: zf.read(name) for name in zf.namelist()}
    
    # Group translations by file
    file_translations = {}
    for idx, translation in enumerate(translations):
        if idx in file_map:
            file_path, start, end, tag, inner_html = file_map[idx]
            if file_path not in file_translations:
                file_translations[file_path] = []
            file_translations[file_path].append((start, end, tag, inner_html, translation))
    
    # Process each file
    for file_path, trans_list in file_translations.items():
        content = files[file_path].decode('utf-8', errors='ignore')
        original_content = content  # Keep reference for position finding
        
        # IMPORTANT: Process translations FIRST, before injecting CSS
        # CSS injection changes content length and invalidates positions
        
        # Sort translations by position (reverse order for correct offset handling)
        trans_list.sort(key=lambda x: x[0], reverse=True)
        
        injected_count = 0
        skipped_count = 0
        
        # Inject translations (work backwards to preserve positions)
        for start, end, tag, inner_html, translation in trans_list:
            # Use exact matching: find the element by its exact content
            # This is more reliable than position-based matching
            
            # Normalize the inner_html for matching (handle whitespace variations)
            inner_html_normalized = ' '.join(inner_html.split())
            if len(inner_html_normalized) < 10:
                skipped_count += 1
                continue
            
            # Search for this exact element in content
            # Build a pattern that matches the tag with any attributes containing our text
            # Use first 50 chars of content for matching to handle minor variations
            match_text = inner_html_normalized[:min(50, len(inner_html_normalized))]
            # Escape special regex chars
            match_text_escaped = re.escape(match_text)
            
            # Find the element containing this text
            element_pattern = re.compile(
                f'<{tag}([^>]*)>([^<]*{match_text_escaped}[^<]*)</{tag}>',
                re.IGNORECASE | re.DOTALL
            )
            element_match = element_pattern.search(content)
            
            if not element_match:
                # Try a simpler approach: find the text directly
                text_pos = content.find(match_text)
                if text_pos == -1:
                    skipped_count += 1
                    continue
                
                # Find the enclosing tag
                # Search backwards for opening tag
                search_back = content[max(0, text_pos - 200):text_pos]
                open_matches = list(re.finditer(f'<{tag}([^>]*)>', search_back, re.IGNORECASE))
                if not open_matches:
                    skipped_count += 1
                    continue
                
                last_open = open_matches[-1]
                actual_start = max(0, text_pos - 200) + last_open.start()
                open_tag_end = max(0, text_pos - 200) + last_open.end()
                existing_attrs = last_open.group(1)
                
                # Find closing tag after the text
                close_tag = f'</{tag}>'
                close_pos = content.lower().find(close_tag.lower(), text_pos)
                if close_pos == -1:
                    skipped_count += 1
                    continue
                
                actual_end = close_pos + len(close_tag)
                inner_content = content[open_tag_end:close_pos]
            else:
                # Use the regex match
                actual_start = element_match.start()
                actual_end = element_match.end()
                existing_attrs = element_match.group(1)
                inner_content = element_match.group(2)
            
            # Skip if already processed (has bbm class)
            if 'bbm-original' in content[actual_start:actual_end] or 'bbm-translated' in content[actual_start:actual_end]:
                skipped_count += 1
                continue
            
            # Build the modified original tag with bbm-original class
            if 'class=' in existing_attrs.lower():
                new_attrs = re.sub(r'class="([^"]*)"', r'class="\1 bbm-original"', existing_attrs, flags=re.IGNORECASE)
            elif existing_attrs.strip():
                new_attrs = existing_attrs + ' class="bbm-original"'
            else:
                new_attrs = ' class="bbm-original"'
            
            # Build the new content
            escaped_translation = escape_html(translation)
            new_content = f'<{tag}{new_attrs}>{inner_content}</{tag}>\n<{tag} class="bbm-translated">{escaped_translation}</{tag}>'
            
            # Replace in content
            content = content[:actual_start] + new_content + content[actual_end:]
            injected_count += 1
        
        log(f"  File {file_path}: injected {injected_count}, skipped {skipped_count}")
        
        # Verify injection worked
        bbm_original_count = content.count('bbm-original')
        bbm_translated_count = content.count('bbm-translated')
        log(f"  VERIFY: {bbm_original_count} bbm-original, {bbm_translated_count} bbm-translated found in content")
        
        # NOW inject CSS and JS into head (after translations are done)
        head_close = content.lower().find('</head>')
        if head_close != -1:
            inject = f'<style type="text/css">{BILINGUAL_CSS}</style>\n<script type="text/javascript">{MODE_SWITCH_JS}</script>\n'
            content = content[:head_close] + inject + content[head_close:]
        
        # Add mode class to body
        body_pattern = re.compile(r'<body([^>]*)>', re.IGNORECASE)
        body_match = body_pattern.search(content)
        if body_match:
            existing_attrs = body_match.group(1)
            if 'class=' in existing_attrs.lower():
                new_attrs = re.sub(r'class="([^"]*)"', r'class="\1 mode-bilingual"', existing_attrs, flags=re.IGNORECASE)
                new_body = f'<body{new_attrs}>'
            else:
                new_body = f'<body{existing_attrs} class="mode-bilingual">'
            content = content[:body_match.start()] + new_body + content[body_match.end():]
        
        files[file_path] = content.encode('utf-8')
    
    log(f"Total translations injected across all files")
    
    # Write new EPUB - IMPORTANT: mimetype must be first and uncompressed per EPUB spec
    with zipfile.ZipFile(output_path, 'w') as zf:
        # Write mimetype first without compression
        if 'mimetype' in files:
            zf.writestr('mimetype', files['mimetype'], compress_type=zipfile.ZIP_STORED)
        
        # Write all other files with compression
        for name, data in files.items():
            if name != 'mimetype':
                zf.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    
    # Verify the output EPUB
    with zipfile.ZipFile(output_path, 'r') as zf:
        test_files = zf.namelist()
        log(f"Output EPUB contains {len(test_files)} files")
        # Check a translated file
        for tf in test_files:
            if tf.lower().endswith('.xhtml') or tf.lower().endswith('.html'):
                test_content = zf.read(tf).decode('utf-8', errors='ignore')
                if 'bbm-translated' in test_content:
                    log(f"VERIFIED: {tf} contains bbm-translated class")
                    break
                elif 'bbm-original' in test_content:
                    log(f"VERIFIED: {tf} contains bbm-original class")
                    break
    
    return output_path

def upload_to_s3(file_path, key):
    """Upload file to S3"""
    s3_client = boto3.client(
        's3',
        aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
        region_name=os.environ.get('AWS_REGION', 'ap-southeast-1')
    )
    
    bucket = os.environ.get('S3_BUCKET')
    
    with open(file_path, 'rb') as f:
        s3_client.upload_fileobj(
            f, bucket, key,
            ExtraArgs={'ContentType': 'application/epub+zip'}
        )
    
    region = os.environ.get('AWS_REGION', 'ap-southeast-1')
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"

def translate_epub_async(job_id, epub_url, callback_url, book_id):
    """Background task to translate EPUB"""
    
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 5
        send_callback(callback_url, book_id, "processing", progress=5)
        
        # Get API config
        api_key = os.environ.get('OPENAI_API_KEY', '')
        base_url = os.environ.get('OPENAI_BASE_URL', 'https://api.deepseek.com/v1')
        model = os.environ.get('OPENAI_MODEL', 'deepseek-chat')
        
        if not api_key:
            raise Exception("OPENAI_API_KEY not configured")
        
        # Create temp directory
        work_dir = tempfile.mkdtemp(prefix=f"epub_{job_id}_")
        input_path = os.path.join(work_dir, "input.epub")
        output_path = os.path.join(work_dir, "bilingual.epub")
        
        # Download EPUB
        log(f"[Job {job_id}] Downloading EPUB...")
        response = requests.get(epub_url, timeout=300)
        response.raise_for_status()
        with open(input_path, 'wb') as f:
            f.write(response.content)
        
        jobs[job_id]["progress"] = 15
        send_callback(callback_url, book_id, "processing", progress=15)
        
        # Extract texts
        log(f"[Job {job_id}] Extracting texts...")
        texts, file_map = extract_texts_from_epub(input_path)
        log(f"[Job {job_id}] Found {len(texts)} texts to translate")
        
        jobs[job_id]["progress"] = 25
        send_callback(callback_url, book_id, "processing", progress=25)
        
        # Translate in batches
        log(f"[Job {job_id}] Translating...")
        batch_size = 20
        all_translations = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            log(f"[Job {job_id}] Translating batch {i//batch_size + 1}/{(len(texts)-1)//batch_size + 1}")
            
            translations = translate_text(batch, api_key, base_url, model)
            all_translations.extend(translations)
            
            # Update progress (25-85%)
            progress = 25 + int((i + len(batch)) / len(texts) * 60)
            jobs[job_id]["progress"] = progress
            send_callback(callback_url, book_id, "processing", progress=progress)
        
        log(f"[Job {job_id}] Creating bilingual EPUB...")
        jobs[job_id]["progress"] = 90
        
        # Create bilingual EPUB
        create_bilingual_epub(input_path, all_translations, file_map, output_path)
        
        # Upload to S3
        log(f"[Job {job_id}] Uploading to S3...")
        timestamp = int(time.time())
        s3_key = f"books/{book_id}/bilingual_{timestamp}.epub"
        bilingual_url = upload_to_s3(output_path, s3_key)
        
        # Cleanup
        shutil.rmtree(work_dir, ignore_errors=True)
        
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["bilingual_url"] = bilingual_url
        
        send_callback(callback_url, book_id, "completed", bilingual_url=bilingual_url)
        log(f"[Job {job_id}] ✓ Translation completed: {bilingual_url}")
        
    except Exception as e:
        log(f"[Job {job_id}] ✗ Translation failed: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        send_callback(callback_url, book_id, "failed", error=str(e))

def send_callback(callback_url, book_id, status, progress=None, bilingual_url=None, error=None):
    if not callback_url:
        return
    try:
        payload = {"bookId": book_id, "status": status}
        if progress is not None:
            payload["progress"] = progress
        if bilingual_url:
            payload["bilingualUrl"] = bilingual_url
        if error:
            payload["error"] = error
        
        log(f"[Callback] Sending to {callback_url}")
        
        headers = {"Content-Type": "application/json"}
        bypass_secret = os.environ.get("VERCEL_PROTECTION_BYPASS")
        if bypass_secret:
            headers["x-vercel-protection-bypass"] = bypass_secret
        
        response = requests.post(callback_url, json=payload, headers=headers, timeout=30)
        log(f"[Callback] Response: {response.status_code}")
        
    except Exception as e:
        log(f"[Callback] Failed: {e}")

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "epub-translate",
        "active_jobs": len(jobs)
    })

@app.route("/", methods=["GET"])
def root():
    return jsonify({
        "message": "EPUB Bilingual Translation Service",
        "version": "1.0.0"
    })

@app.route("/translate", methods=["POST"])
def translate():
    data = request.json or {}
    book_id = data.get("bookId")
    epub_url = data.get("epubUrl")
    callback_url = data.get("callbackUrl")
    
    if not epub_url or not book_id:
        return jsonify({"error": "epubUrl and bookId are required"}), 400
    
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "book_id": book_id,
        "created_at": time.time()
    }
    
    thread = threading.Thread(
        target=translate_epub_async,
        args=(job_id, epub_url, callback_url, book_id)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        "jobId": job_id,
        "status": "pending",
        "message": "Translation job started"
    })

@app.route("/status/<job_id>", methods=["GET"])
def status(job_id):
    if job_id not in jobs:
        return jsonify({"error": "Job not found"}), 404
    
    job = jobs[job_id]
    return jsonify({
        "jobId": job_id,
        "status": job.get("status"),
        "progress": job.get("progress", 0),
        "bilingualUrl": job.get("bilingual_url"),
        "error": job.get("error")
    })

log("Routes registered")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    log(f"Starting on port {port}")
    app.run(host="0.0.0.0", port=port)
