# Vercel 部署可能的问题

## 1. 函数超时限制
- Hobby 计划: 10 秒
- Pro 计划: 60 秒
- Enterprise: 900 秒

上传初始化和生成 presigned URL 可能超时。

## 2. 请求体大小限制
- Vercel 限制请求体最大 4.5MB
- 但我们用的是 presigned URL,文件直接上传到 S3,不经过 Vercel

## 3. 可能的问题点

### A. Presigned URL 过期时间太短
当前设置: 900 秒 (15分钟)
大文件上传可能需要更长时间

### B. 生成太多 presigned URL
代码中限制生成前 100 个 part 的 URL
如果文件很大,可能需要按需生成

### C. Vercel 边缘网络问题
某些区域可能无法访问 S3

## 建议的调试步骤

1. 检查浏览器控制台的具体错误
2. 查看 Network 标签中失败的请求
3. 检查 Vercel 部署日志
4. 测试小文件是否能上传成功
