# 第一版实现说明

## 结构与调用链

这是 Electron 客户端：React 负责界面，preload 暴露少量 IPC，主进程负责文件、网络与模型调用。没有独立 Web 业务后端、SQL 服务或向量库。

```text
App / PdfReader / PaperTree
  → preload IPC
  → index.ts 注册入口
  → workflow.ts 编排导入、索引、检索和建树
      ├─ model.ts：PDF 文本提取与模型接口
      ├─ research.ts：参考文献定位、论文检索与候选筛选
      ├─ acquire.ts：获取窗口、浏览器会话与下载
      └─ storage.ts：SQLite 和 PDF 文件
```

传统开发部分是界面、IPC、存储和下载。AI 部分只有主题提取、检索标题生成、候选筛选；没有聊天 Agent 或向量 RAG。

## 阅读与关联

PDF.js 的 `PDFViewer` 提供连续多页阅读及文字层。选中文字后提交论文 ID、页码和原文。右侧结果气泡不改变 PDF 宽度，在正文上开始下一次划选时自动收起。

左侧每篇论文占一行，显示进入该论文的概念。分支可折叠，当前节点及祖先高亮；悬停查看完整标题和来源页。节点行高 30 px，行间距 2 px。左侧使用自有 `library-rail` 类名，避免与 PDF.js 样式冲突。

## 索引与检索

1. 首次读取 PDF 时后台建立索引：本地提取逐页文本和编号参考文献，去掉重复引用编号；模型读取首页，提取标题和主题。索引失败不阻止阅读，检索时可重试。
2. 优先将选中概念与参考文献标题按词匹配，没有命中再查当前页附近的引用编号，避免把 `SSD` 错配到 `process defect` 之类的连续字符。
3. 有 arXiv ID 则直接定位；其他情况由模型提取或展开完整论文标题。arXiv 按标题搜索，Crossref 按书目信息搜索；配置 Key 后并行查询 IEEE。
4. 先按标题或 DOI 排除本篇、合并同名候选，再让模型返回现有候选的索引和关联原因；允许没有相关候选。
5. 下载成功后保存论文和父子关系。每条边保留源论文、目标论文、选中文字和页码。由不同路径到达同一论文时，仍保留独立树节点。

`storage.ts` 使用 Node 内置 SQLite：`state` 保存论文、关系和任务的 JSON；`paper_index` 按论文 ID 缓存标题、主题、DOI、页文本和参考文献。PDF 单独存放。旧 `workspace.json` 在数据库没有状态时迁移，原文件保留。

## 下载与学校登录

`acquire.ts` 只处理当前获取窗口的浏览器下载：公开候选通过 `webContents.downloadURL` 发起；其余由用户登录并点击出版商下载入口。`session.will-download` 设置保存路径，下载完成后校验 PDF 文件头、保存文件并建立关联。

它不监控整个电脑的下载目录。系统浏览器中的文件通过“手动补入 PDF”关联。网页会话由获取窗口持有，能否跨重启复用取决于站点 Cookie 的有效期。

学校网页登录会话不是通用的 API Token。`IEEE_API_KEY` 只用于元数据检索；付费全文 API 需要机构另外开通授权，当前未实现。依据：[IEEE 机构访问说明](https://ieeexplore.ieee.org/Xplorehelp/administrators-and-librarians/account-management)、[全文 API 授权](https://developer.ieee.org/Chargeable_Full_Text_Requests)。

## NVIDIA 接入：待完成

项目要求使用 NVIDIA 官方 Agent Skills，并在 DGX Spark 上部署、通过 NVIDIA 软件提供模型推理；当前尚未完成。模型不计划微调。

拟采用官方 `aiq-research`，它需要可达的 AI-Q 后端。可以由 Electron 启动仅绑定 `127.0.0.1` 的伴随进程，等待健康检查后执行官方 helper，退出时只停止本次应用启动的进程。首次仍需安装 Python/AI-Q、配置模型和至少一个检索源；是否兼容现有千问需要实测。该方案尚未实现。

官方原件未被当前源码引用，现与许可证一起保存在本地 `input/archive/first-prototype-history.zip`，不作为第一版运行依赖。实际接入时应重新引入并验证，不能用保存 Skill 文件代替执行证据。

- [NVIDIA Skills](https://github.com/NVIDIA/skills)，此前保存版本：`ef46204b2605c237c58e8eaf706bbed615462b75`。
- [aiq-research 原件](https://github.com/NVIDIA/skills/blob/ef46204b2605c237c58e8eaf706bbed615462b75/skills/aiq-research/SKILL.md)。脚本声明的 Apache-2.0 和 CC-BY-4.0 许可证随本地原件保存。
- [AI-Q Blueprint](https://github.com/NVIDIA-AI-Blueprints/aiq)。推理服务与 AI-Q 研究后端是两个独立角色。
