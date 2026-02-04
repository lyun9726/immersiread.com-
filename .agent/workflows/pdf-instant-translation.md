---
description: PDF 即时翻译功能实现方案（使用 BabelDOC）
---

# PDF 即时翻译功能实现方案

> **文档版本**: 1.0  
> **创建日期**: 2026-02-04  
> **最后更新**: 2026-02-04  
> **状态**: 待实施

---

## 一、项目背景

### 1.1 当前问题

现有的 PDF 翻译功能采用**整本翻译**模式：

```
用户请求翻译 → 整本 PDF 翻译（耗时几分钟~几十分钟）→ 翻译完成后才能查看
```

**问题**：
1. 用户需要等待整本书翻译完成，等待时间过长
2. 用户体验差，与 ePub 的"即时翻译"体验差距巨大
3. 浪费 Token：用户可能只看前几页，但整本书都被翻译了

### 1.2 目标

实现与 ePub 相同的**即时翻译**体验：

```
用户打开 PDF → 立即显示原文 → 翻到哪页翻译哪页 → 翻译结果缓存
```

**核心原则**：
1. ✅ 保留 PDF 原始排版
2. ✅ 按页即时翻译（翻到哪页翻译哪页）
3. ✅ 翻译结果缓存复用（译文模式和双语模式共用同一份翻译）
4. ✅ 翻译 API 与 ePub 保持一致（Google Translate）

---

## 二、技术方案选型

### 2.1 翻译工具对比

| 工具 | 按页翻译 | 保留排版 | 无水印 | 开源 | 选择 |
|------|----------|----------|--------|------|------|
| pdf2zh (PDFMathTranslate) | ❌ | ✅ | ❌ | ✅ | ❌ 不选 |
| **BabelDOC** | ✅ | ✅ | ✅ | ✅ | ✅ **选用** |

### 2.2 选择 BabelDOC 的原因

1. **支持按页翻译**：`--pages N` 参数可以只翻译指定页
2. **支持无水印**：`--watermark-output-mode=no_watermark`
3. **支持只输出翻译页**：`--only-include-translated-page`
4. **支持多种翻译服务**：OpenAI、DeepSeek、Google Translate 等
5. **活跃开发**：GitHub 仓库 https://github.com/funstory-ai/BabelDOC

---

## 三、系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端 (Next.js)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │   原文模式       │    │   译文模式       │    │   双语模式       │         │
│  │   显示原 PDF    │    │   显示翻译 PDF   │    │   左右并排       │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│           │                      │                      │                   │
│           └──────────────────────┴──────────────────────┘                   │
│                                  │                                          │
│                    ┌─────────────▼─────────────┐                           │
│                    │      翻译控制器            │                           │
│                    │  - 检查本地缓存 (IndexedDB) │                           │
│                    │  - 按需请求翻译            │                           │
│                    │  - 预翻译下一页            │                           │
│                    └─────────────┬─────────────┘                           │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   POST /api/translate/pdf/page │
                    │   Vercel API Route            │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   检查 S3 缓存               │
                    │   有 → 直接返回 URL          │
                    │   无 → 调用 Railway 服务     │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Railway 服务 (BabelDOC)    │
                    │   - 下载原 PDF               │
                    │   - 调用 babeldoc --pages N  │
                    │   - 上传翻译结果到 S3        │
                    │   - 返回 S3 URL              │
                    └─────────────────────────────┘
```

### 3.2 数据流程

```
用户打开 PDF
    │
    ▼
┌───────────────────────────────────────────────────────────┐
│ 显示原文 PDF（立即，无等待）                               │
└───────────────────────────────────────────────────────────┘
    │
    ▼ 用户切换到"双语模式"或"译文模式"
    │
┌───────────────────────────────────────────────────────────┐
│ 1. 检查 IndexedDB 缓存                                    │
│    - 有缓存 → 直接使用，跳到步骤 5                         │
│    - 无缓存 → 继续步骤 2                                  │
└───────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────┐
│ 2. 调用 POST /api/translate/pdf/page                      │
│    请求体: { bookId, pageNumber, targetLang }             │
└───────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────┐
│ 3. 后端检查 S3 缓存                                       │
│    - 有缓存 → 返回 S3 URL                                 │
│    - 无缓存 → 调用 Railway 服务翻译                        │
└───────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Railway 服务执行翻译                                   │
│    babeldoc input.pdf --pages N                           │
│    --watermark-output-mode=no_watermark                   │
│    --only-include-translated-page                         │
│    → 上传到 S3                                            │
│    → 返回 S3 URL                                          │
└───────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────┐
│ 5. 前端渲染                                               │
│    - 译文模式：显示翻译后的 PDF 页                         │
│    - 双语模式：左边原 PDF，右边翻译 PDF                    │
│    - 缓存到 IndexedDB                                     │
└───────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────┐
│ 6. 预翻译下一页（后台静默执行）                            │
│    - 请求翻译 Page N+1, N+2                               │
│    - 用户翻页时直接使用缓存                                │
└───────────────────────────────────────────────────────────┘
```

---

## 四、展示模式详细说明

### 4.1 PC 端（桌面端）

| 模式 | 展示方式 | 说明 |
|------|----------|------|
| **原文模式** | 原始 PDF | pdf.js 直接渲染原 PDF |
| **译文模式** | 翻译后的 PDF（保留排版） | 使用 BabelDOC 翻译后的单页 PDF |
| **双语模式** | 左右并排 | 左边：原 PDF 页面<br>右边：翻译后的 PDF 页面<br>同步滚动、同步翻页 |

**双语模式布局示意**：
```
┌─────────────────────────────────────────────────────────┐
│                     PDF 阅读器                          │
├────────────────────────┬────────────────────────────────┤
│                        │                                │
│      原文 PDF          │         译文 PDF               │
│      (Page N)          │         (Page N)               │
│                        │                                │
│  Hello World           │  你好世界                       │
│  This is a book.       │  这是一本书。                   │
│                        │                                │
├────────────────────────┴────────────────────────────────┤
│                     翻页控制                            │
└─────────────────────────────────────────────────────────┘
```

### 4.2 手机端（移动端）

| 模式 | 展示方式 | 说明 |
|------|----------|------|
| **原文模式** | 原始 PDF | 左右滑动翻页（不是上下滚动） |
| **译文模式** | 翻译后的 PDF | 左右滑动翻页 |
| **双语模式** | 上下排列（像 ePub） | 原文在上，译文在下<br>左右滑动翻页 |

**手机端双语模式布局示意**：
```
┌─────────────────────┐
│                     │
│   原文 PDF 内容      │
│   (Page N 上半部分)  │
│                     │
├─────────────────────┤
│                     │
│   译文内容           │
│   (对应翻译)         │
│                     │
└─────────────────────┘
    ← 左右滑动翻页 →
```

**手机端翻页方式**：
- 使用 Swiper.js 或 CSS scroll-snap 实现
- 每一页 = 一个 viewport
- 左滑 = 下一页，右滑 = 上一页
- 类似 Kindle / Apple Books 的阅读体验

---

## 五、API 设计

### 5.1 新增 API：单页翻译

**端点**：`POST /api/translate/pdf/page`

**请求体**：
```json
{
  "bookId": "uuid-of-book",
  "pageNumber": 5,
  "targetLang": "zh"
}
```

**响应（翻译完成）**：
```json
{
  "status": "completed",
  "pageNumber": 5,
  "translatedPageUrl": "https://s3.amazonaws.com/bucket/books/{bookId}/translated_pages/page_5_zh.pdf",
  "cached": false
}
```

**响应（翻译进行中）**：
```json
{
  "status": "processing",
  "pageNumber": 5,
  "message": "Translation in progress"
}
```

**响应（错误）**：
```json
{
  "status": "failed",
  "error": "Translation service unavailable"
}
```

### 5.2 Railway 服务 API

**端点**：`POST /translate/page`

**请求体**：
```json
{
  "bookId": "uuid-of-book",
  "pdfUrl": "https://s3.amazonaws.com/bucket/books/{bookId}/original.pdf",
  "pageNumber": 5,
  "targetLang": "zh",
  "callbackUrl": "https://your-app.vercel.app/api/translate/pdf/page/callback"
}
```

**响应**：
```json
{
  "jobId": "job-uuid",
  "status": "processing"
}
```

---

## 六、缓存策略

### 6.1 三级缓存

| 级别 | 存储位置 | 生命周期 | 用途 |
|------|----------|----------|------|
| L1 | 前端 IndexedDB | 持久化（用户本地） | 最快访问，离线可用 |
| L2 | S3 | 持久化（云端） | 跨设备共享，永久存储 |
| L3 | Railway 内存 | 短期（任务完成前） | 翻译任务状态 |

### 6.2 缓存 Key 设计

```
S3 路径: books/{bookId}/translated_pages/page_{pageNumber}_{targetLang}.pdf

示例:
books/abc123/translated_pages/page_1_zh.pdf
books/abc123/translated_pages/page_2_zh.pdf
books/abc123/translated_pages/page_3_zh.pdf
```

### 6.3 IndexedDB 结构

```typescript
interface TranslatedPageCache {
  bookId: string;
  pageNumber: number;
  targetLang: string;
  translatedPageUrl: string;
  cachedAt: number; // timestamp
}

// IndexedDB 存储名: 'pdf-translation-cache'
// Key: `${bookId}_page_${pageNumber}_${targetLang}`
```

---

## 七、BabelDOC 命令详解

### 7.1 单页翻译命令

```bash
babeldoc input.pdf \
  --pages 5 \
  --lang-out zh \
  --watermark-output-mode=no_watermark \
  --only-include-translated-page \
  --output ./output/
```

**参数说明**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `input.pdf` | 原始 PDF 路径 | 原始 PDF 文件 |
| `--pages` | `5` | 只翻译第 5 页 |
| `--lang-out` | `zh` | 目标语言（中文） |
| `--watermark-output-mode` | `no_watermark` | 不添加水印 |
| `--only-include-translated-page` | - | 输出只包含翻译后的页面 |
| `--output` | `./output/` | 输出目录 |

### 7.2 翻译服务配置

BabelDOC 使用环境变量配置翻译服务：

```bash
# 使用 Google Translate（免费，与 ePub 保持一致）
export BABELDOC_TRANSLATOR=google

# 或使用 OpenAI
export OPENAI_API_KEY=your-api-key
export BABELDOC_TRANSLATOR=openai
export OPENAI_MODEL=gpt-4
```

---

## 八、文件修改清单

### 8.1 需要新增的文件

| 文件路径 | 用途 |
|----------|------|
| `app/api/translate/pdf/page/route.ts` | 单页翻译 API |
| `app/api/translate/pdf/page/callback/route.ts` | 翻译完成回调 |
| `lib/storage/pdfTranslationCache.ts` | 翻译缓存管理（IndexedDB + S3） |
| `components/reader/pdf-bilingual-renderer.tsx` | 双语模式渲染组件 |
| `components/reader/pdf-mobile-renderer.tsx` | 手机端 PDF 渲染组件 |

### 8.2 需要修改的文件

| 文件路径 | 修改内容 |
|----------|----------|
| `services/pdf-translate/server.py` | 替换 pdf2zh → BabelDOC，新增单页翻译接口 |
| `services/pdf-translate/requirements.txt` | 添加 BabelDOC 依赖 |
| `services/pdf-translate/Dockerfile` | 安装 BabelDOC |
| `components/reader/pdf-renderer.tsx` | 添加按需翻译逻辑、三种模式切换 |
| `lib/types.ts` | 添加新的类型定义 |

### 8.3 可选删除的文件

| 文件路径 | 原因 |
|----------|------|
| （无需删除） | 保留旧的整本翻译功能作为兼容 |

---

## 九、Railway 服务修改

### 9.1 服务器代码修改 (server.py)

**新增单页翻译函数**：

```python
def translate_page_async(job_id, pdf_url, page_number, target_lang, callback_url, book_id):
    """使用 BabelDOC 翻译单页"""
    try:
        jobs[job_id]["status"] = "processing"
        
        # 创建临时目录
        work_dir = tempfile.mkdtemp(prefix=f"babeldoc_{job_id}_")
        input_path = os.path.join(work_dir, "input.pdf")
        output_dir = os.path.join(work_dir, "output")
        os.makedirs(output_dir, exist_ok=True)
        
        # 下载 PDF
        log(f"[Job {job_id}] Downloading PDF...")
        response = requests.get(pdf_url, timeout=300)
        response.raise_for_status()
        with open(input_path, 'wb') as f:
            f.write(response.content)
        
        # 运行 BabelDOC
        log(f"[Job {job_id}] Translating page {page_number}...")
        cmd = [
            "babeldoc",
            input_path,
            "--pages", str(page_number),
            "--lang-out", target_lang,
            "--watermark-output-mode=no_watermark",
            "--only-include-translated-page",
            "--output", output_dir
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 分钟超时（单页应该很快）
            cwd=work_dir,
            env=os.environ.copy()
        )
        
        if result.returncode != 0:
            raise Exception(f"BabelDOC failed: {result.stderr}")
        
        # 查找输出文件
        output_files = [f for f in os.listdir(output_dir) if f.endswith('.pdf')]
        if not output_files:
            raise Exception("No output PDF found")
        
        output_path = os.path.join(output_dir, output_files[0])
        
        # 上传到 S3
        s3_key = f"books/{book_id}/translated_pages/page_{page_number}_{target_lang}.pdf"
        translated_url = upload_to_s3(output_path, s3_key)
        
        # 清理
        shutil.rmtree(work_dir, ignore_errors=True)
        
        # 更新状态并回调
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["translated_url"] = translated_url
        send_callback(callback_url, book_id, "completed", 
                     page_number=page_number, translated_url=translated_url)
        
        log(f"[Job {job_id}] ✓ Page {page_number} translation completed: {translated_url}")
        
    except Exception as e:
        log(f"[Job {job_id}] ✗ Translation failed: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        send_callback(callback_url, book_id, "failed", error=str(e))
```

**新增 API 路由**：

```python
@app.route("/translate/page", methods=["POST"])
def translate_page():
    """翻译单页"""
    data = request.json or {}
    book_id = data.get("bookId")
    pdf_url = data.get("pdfUrl")
    page_number = data.get("pageNumber")
    target_lang = data.get("targetLang", "zh")
    callback_url = data.get("callbackUrl")
    
    if not pdf_url or not book_id or page_number is None:
        return jsonify({"error": "pdfUrl, bookId and pageNumber are required"}), 400
    
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "pending",
        "book_id": book_id,
        "page_number": page_number,
        "created_at": time.time()
    }
    
    thread = threading.Thread(
        target=translate_page_async,
        args=(job_id, pdf_url, page_number, target_lang, callback_url, book_id)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        "jobId": job_id,
        "status": "processing",
        "message": f"Page {page_number} translation started"
    })
```

### 9.2 Dockerfile 修改

```dockerfile
FROM python:3.11-slim

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# 安装 BabelDOC
RUN pip install --no-cache-dir babeldoc

# 安装其他 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY server.py .

# 运行服务
CMD ["python", "server.py"]
```

### 9.3 requirements.txt 修改

```
flask
flask-cors
requests
boto3
babeldoc
```

---

## 十、前端实现详解

### 10.1 PDF 渲染器修改 (pdf-renderer.tsx)

**新增状态**：

```typescript
// 阅读模式
type ReadingMode = 'original' | 'translation' | 'bilingual';

// 翻译页缓存
interface PageTranslation {
  pageNumber: number;
  translatedUrl: string;
  status: 'idle' | 'loading' | 'loaded' | 'error';
}

const [readingMode, setReadingMode] = useState<ReadingMode>('original');
const [pageTranslations, setPageTranslations] = useState<Map<number, PageTranslation>>(new Map());
```

**翻译请求函数**：

```typescript
async function requestPageTranslation(pageNumber: number): Promise<string | null> {
  // 1. 检查 IndexedDB 缓存
  const cached = await getCachedTranslation(bookId, pageNumber, targetLang);
  if (cached) {
    return cached.translatedUrl;
  }

  // 2. 更新状态为加载中
  setPageTranslations(prev => new Map(prev).set(pageNumber, {
    pageNumber,
    translatedUrl: '',
    status: 'loading'
  }));

  // 3. 请求翻译
  try {
    const response = await fetch('/api/translate/pdf/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId, pageNumber, targetLang })
    });

    const result = await response.json();

    if (result.status === 'completed') {
      // 4. 缓存到 IndexedDB
      await cacheTranslation(bookId, pageNumber, targetLang, result.translatedPageUrl);
      
      // 5. 更新状态
      setPageTranslations(prev => new Map(prev).set(pageNumber, {
        pageNumber,
        translatedUrl: result.translatedPageUrl,
        status: 'loaded'
      }));
      
      return result.translatedPageUrl;
    }
  } catch (error) {
    console.error('Translation failed:', error);
    setPageTranslations(prev => new Map(prev).set(pageNumber, {
      pageNumber,
      translatedUrl: '',
      status: 'error'
    }));
  }

  return null;
}
```

**预翻译机制**：

```typescript
useEffect(() => {
  if (readingMode !== 'original' && currentPage > 0) {
    // 翻译当前页
    requestPageTranslation(currentPage);
    
    // 预翻译下两页（静默）
    requestPageTranslation(currentPage + 1);
    requestPageTranslation(currentPage + 2);
  }
}, [currentPage, readingMode]);
```

### 10.2 双语模式渲染 (PC)

```tsx
{readingMode === 'bilingual' && (
  <div className="flex h-full">
    {/* 左侧：原文 */}
    <div className="flex-1 border-r">
      <Document file={originalPdfUrl}>
        <Page pageNumber={currentPage} width={containerWidth / 2} />
      </Document>
    </div>
    
    {/* 右侧：译文 */}
    <div className="flex-1">
      {pageTranslations.get(currentPage)?.status === 'loaded' ? (
        <Document file={pageTranslations.get(currentPage)!.translatedUrl}>
          <Page pageNumber={1} width={containerWidth / 2} />
        </Document>
      ) : (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="animate-spin" />
          <span>翻译中...</span>
        </div>
      )}
    </div>
  </div>
)}
```

### 10.3 手机端渲染

```tsx
// 使用 Swiper 实现左右滑动翻页
import { Swiper, SwiperSlide } from 'swiper/react';

{isMobile && (
  <Swiper
    direction="horizontal"
    slidesPerView={1}
    onSlideChange={(swiper) => setCurrentPage(swiper.activeIndex + 1)}
  >
    {Array.from({ length: numPages }, (_, i) => (
      <SwiperSlide key={i}>
        {readingMode === 'bilingual' ? (
          // 上下双语
          <div className="flex flex-col h-full">
            <div className="flex-1">
              <Page pageNumber={i + 1} />
            </div>
            <div className="flex-1 bg-blue-50">
              {/* 译文内容 */}
            </div>
          </div>
        ) : (
          // 原文或译文
          <Page pageNumber={i + 1} />
        )}
      </SwiperSlide>
    ))}
  </Swiper>
)}
```

---

## 十一、类型定义

### 11.1 lib/types.ts 新增

```typescript
// PDF 翻译相关类型

/** 单页翻译请求 */
export interface PdfPageTranslationRequest {
  bookId: string;
  pageNumber: number;
  targetLang: string;
}

/** 单页翻译响应 */
export interface PdfPageTranslationResponse {
  status: 'completed' | 'processing' | 'failed';
  pageNumber: number;
  translatedPageUrl?: string;
  cached?: boolean;
  error?: string;
}

/** 翻译页缓存项 */
export interface TranslatedPageCache {
  bookId: string;
  pageNumber: number;
  targetLang: string;
  translatedPageUrl: string;
  cachedAt: number;
}

/** PDF 阅读模式 */
export type PdfReadingMode = 'original' | 'translation' | 'bilingual';
```

---

## 十二、执行步骤

### 第 1 步：修改 Railway 服务（优先级：高）

1. [ ] 修改 `services/pdf-translate/Dockerfile`，安装 BabelDOC
2. [ ] 修改 `services/pdf-translate/requirements.txt`，添加 BabelDOC 依赖
3. [ ] 修改 `services/pdf-translate/server.py`：
   - [ ] 新增 `translate_page_async` 函数
   - [ ] 新增 `/translate/page` 路由
   - [ ] 添加 S3 上传函数
4. [ ] 重新部署 Railway 服务
5. [ ] 测试单页翻译功能

### 第 2 步：新增 Vercel API（优先级：高）

1. [ ] 创建 `app/api/translate/pdf/page/route.ts`
2. [ ] 创建 `app/api/translate/pdf/page/callback/route.ts`
3. [ ] 测试 API 端点

### 第 3 步：添加缓存层（优先级：中）

1. [ ] 创建 `lib/storage/pdfTranslationCache.ts`
2. [ ] 实现 IndexedDB 缓存逻辑
3. [ ] 实现 S3 缓存检查逻辑

### 第 4 步：修改前端渲染（优先级：高）

1. [ ] 修改 `components/reader/pdf-renderer.tsx`：
   - [ ] 添加阅读模式状态
   - [ ] 添加按需翻译逻辑
   - [ ] 添加预翻译机制
2. [ ] 实现 PC 端双语模式（左右并排）
3. [ ] 实现 PC 端译文模式

### 第 5 步：实现手机端（优先级：中）

1. [ ] 创建 `components/reader/pdf-mobile-renderer.tsx`
2. [ ] 实现左右滑动翻页
3. [ ] 实现上下双语模式
4. [ ] 测试手机端体验

### 第 6 步：测试与优化（优先级：高）

1. [ ] 测试完整流程
2. [ ] 性能优化
3. [ ] 错误处理
4. [ ] 用户体验优化

---

## 十三、测试清单

### 13.1 功能测试

| 测试项 | 预期结果 | 通过 |
|--------|----------|------|
| 打开 PDF 立即显示原文 | ✅ 无等待 | [ ] |
| 切换到译文模式 | ✅ 当前页开始翻译，几秒后显示 | [ ] |
| 切换到双语模式（PC） | ✅ 左边原文，右边译文 | [ ] |
| 翻页后自动翻译新页 | ✅ 自动翻译 | [ ] |
| 已翻译页再次访问 | ✅ 使用缓存，无等待 | [ ] |
| 手机端左右滑动翻页 | ✅ 流畅翻页 | [ ] |
| 手机端上下双语 | ✅ 原文在上，译文在下 | [ ] |

### 13.2 边界测试

| 测试项 | 预期结果 | 通过 |
|--------|----------|------|
| 翻译超时 | ✅ 显示错误，可重试 | [ ] |
| 网络断开 | ✅ 使用本地缓存 | [ ] |
| 大 PDF（>100页） | ✅ 按页加载，不卡顿 | [ ] |
| 快速翻页 | ✅ 预翻译生效，无等待 | [ ] |

---

## 十四、问题与风险

### 14.1 已知风险

| 风险 | 应对措施 |
|------|----------|
| BabelDOC 单页翻译速度 | 预翻译下一页；显示进度条 |
| Railway 服务超时 | 设置合理超时；支持重试 |
| S3 存储成本 | 设置缓存过期时间 |
| 翻译 API 费用（如使用 OpenAI） | 默认使用免费的 Google Translate |

### 14.2 待确认事项

| 问题 | 状态 |
|------|------|
| BabelDOC 是否稳定 | 待测试 |
| 单页翻译平均耗时 | 待测试 |
| Google Translate 是否需要 API Key | 待确认 |

---

## 十五、参考资料

1. **BabelDOC GitHub**: https://github.com/funstory-ai/BabelDOC
2. **react-pdf**: https://github.com/wojtekmaj/react-pdf
3. **Swiper.js**: https://swiperjs.com/

---

## 十六、变更日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-02-04 | 1.0 | 初始版本 |

---

**文档结束**
