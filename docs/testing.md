# 测试与验收

[返回 README](../README.md) · [使用指南](usage.md) · [NVIDIA 接入](skills.md)

## 自动检查

从项目根目录执行：

```bash
npm run build
npm test
npm run test:desktop
```

| 命令 | 验证内容 | 外部依赖 |
| --- | --- | --- |
| `build` | 文件/行数预算、TypeScript、Electron 构建 | 已安装 npm 依赖 |
| `test` | SQLite 持久化、引用定位、查询规划、候选排除、分支删除、官方 helper 协议 | 本机模拟 HTTP 服务及 Python；不请求真实模型 |
| `test:desktop` | 连续 PDF、框选、标记、气泡、登录下载、递归关联、工作区切换、改名/删除、设置迁移、重启、中英文切换 | 桌面显示环境；本机模拟模型和出版商 |

桌面测试创建独立临时工作区及两页合成 PDF，不修改正常阅读库。关键截图路径在终端末尾输出；它验证真实 Electron 下载事件与受控 Cookie 会话，但**不等于真实学校 SSO 通过**。

## 真实接口验证（按需）

`test:api` 读取 `.env` / 进程环境，而非客户端 SQLite 中加密保存的设置。首次配置可将 `.env.example` 复制为 `.env`，已有文件不要覆盖；填写 `QWEN_BASE_URL`、`QWEN_API_KEY`、`QWEN_MODEL`，并先完成 `npm run setup:aiq`。

```bash
npm run test:api
# 可选：验证自己有权使用的同版本 PDF 的实际索引
npm run test:api -- "/absolute/path/to/YOLO-HMC.pdf"
```

默认使用代码内的公开书目信息，不读取本地论文。传入 PDF 时会提取并发送首页及研究所需上下文。该测试会调用真实模型、AI-Q 和学术来源，产生 API 用量。若连接已经运行的本机 AI-Q，可设置 `AIQ_SERVER_URL=http://127.0.0.1:18181`；该后台需已配置模型。

通过标准：执行官方 `aiq-research`，保留带 URL 的研究报告，返回 `arXiv:2207.14284` 对应 HorNet，排除母论文，并给出关联原因。不要只看模型生成的解释，须核对候选标题和 URL。

## 固定检索样例

| 源论文 | 框选内容 | 预期目标 / 依据 |
| --- | --- | --- |
| YOLO-HMC: An Improved Method for PCB Surface Defect Detection | 首页 `HorNet` | [HorNet](https://arxiv.org/abs/2207.14284)，缓存参考文献 [31] |
| YOLO-HMC | 首页 `CARAFE` | [CARAFE](https://arxiv.org/abs/1905.02188)，缓存参考文献 [34] |
| HorNet | 首页 `ConvNeXt` | [A ConvNet for the 2020s](https://arxiv.org/abs/2201.03545)，跨页方法引用 [43] |
| CARAFE | 首页 `Feature Pyramid Network` | [Feature Pyramid Networks for Object Detection](https://arxiv.org/abs/1612.03144)，缓存参考文献 [21] |

YOLO-HMC DOI 为 `10.1109/TIM.2024.3351241`；历史验收使用用户已有的 11 页 PDF（索引提取 45 条参考文献），仓库不附该文件。新使用者可直接导入公开 HorNet PDF，从 `ConvNeXt` 用例开始。引用编号和页码以对应 PDF 版本为准。

## 桌面验收步骤

1. 导入论文，确认显示 PDF 原版面，主题和参考文献能建立索引。
2. 连续滚动跨页，检查底部页码、缩放和普通阅读模式。
3. 点击框选工具，拖框覆盖完整术语；拖动和松开后都能看到矩形；扫描图片/空白区域不触发检索。
4. 点击框边关联按钮。结果气泡不改变 PDF 宽度；核对来源、检索意图、候选标题和 Skill 研究记录。
5. 获取公开 PDF，检查下载完成后才生成子节点；从子论文继续探索，形成至少一条二级分支。
6. 回到源论文，确认来源矩形进入视口；重开历史结果、缩放后检查标记仍贴合原文。
7. 收起工作区、拖分隔线，检查图中节点适配视野，PDF 保持可用。
8. 在**独立测试库**中改名、删除一个有子节点的分支；分别验证取消和确认，父论文的检索标记保留。
9. 顶部切换语言，即时改变工具栏和提示；重启后保留语言。模型设置仍需要保存并重启。
10. 重启后核对论文、关系、检索框和缓存仍存在。

同一个候选再次导入可能生成重复节点；只验证检索时，可在获取前停止。

## 机构访问专项

由用户选择确有订阅权限的论文，记录 DOI、校园网/VPN/图书馆代理/SSO 方式及是否已有会话。在获取窗口登录后点击实际 PDF 下载入口，再确认下载和建树；关闭后重开，检查 Cookie 是否仍有效。

若站点不兼容内嵌窗口，使用系统浏览器下载，再手动补入。学校登录会话不是通用 API Token；元数据 API Key 不授予付费全文访问权。不得用模拟出版商回归宣称任意学校/IEEE 登录都已验证。

## 真实样例与已知问题

2026-09-27 曾通过真实 UI 从空工作区建立 **5 篇论文 / 4 条关联**：

```text
YOLO-HMC
├── HorNet
│   └── A ConvNet for the 2020s
└── CARAFE
    └── Feature Pyramid Networks for Object Detection
```

前三次公开全文下载由应用捕获。FPN 的 IEEE 页面返回 418，随后从 [CVF 公开 PDF](https://openaccess.thecvf.com/content_cvpr_2017/papers/Lin_Feature_Pyramid_Networks_CVPR_2017_paper.pdf) 下载并手动补入；没有宣称这一分支全自动完成。过程中遇到过 OpenAlex 429 和 arXiv Atom 超时，当前精确 arXiv ID 改用摘要页，关键词使用 OpenAlex / Crossref。

本机 `.prototype-data/branching-demo` 是该真实工作区，已被 Git 忽略，不属于新克隆的预置数据。截图保留真实历史，其中 HorNet 同一区域的多次检索标记会重叠；目前未实现标记归并。模型可能误判候选，下载也不自动验证学术身份。

最新截图和操作解释见 [使用指南](usage.md)。本轮文档整理没有重新执行付费检索；历史联网验证、离线回归与文档截图三者应分别理解。
