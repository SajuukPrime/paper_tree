# NVIDIA Agent Skill 接入

[返回 README](../README.md) · [架构](architecture.md) · [测试](testing.md)

## 使用了什么

Paper Tree 使用官方 **`aiq-research`**，通过官方 Python helper 调用本机 AI-Q。它是固定研究流程中的实际调用，不是仅保存 Skill 文件，也不是通用的多 Skill 自动选择框架。

| 部分 | 来源 / 作用 |
| --- | --- |
| `vendor/nvidia-skills/aiq-research/SKILL.md` | 官方使用说明 |
| `vendor/nvidia-skills/aiq-research/scripts/aiq.py` | 原样官方 helper，执行 health/chat/status/report |
| `src/main/skills.ts` | 应用适配：启动后台、调用 helper、处理报告和错误 |
| `backend/aiq.yml` | 自定义 AI-Q 配置：模型、研究 Agent 和论文数据源 |
| `backend/paper_search.py` | 自定义 NAT 论文工具，不是另写一个 Agent Skill |

官方 Skill 固定提交为 `d8519c57da6db5d9bea274ec1724a4a7a56a3dee`，见 [版本文件](../vendor/nvidia-skills/UPSTREAM_COMMIT)。[Apache-2.0](../vendor/nvidia-skills/LICENSE-APACHE) 与 [CC-BY-4.0](../vendor/nvidia-skills/LICENSE-CC-BY-4.0) 许可证随原件保留。

上游：[NVIDIA/skills](https://github.com/NVIDIA/skills) · [AI-Q Blueprint](https://github.com/NVIDIA-AI-Blueprints/aiq)。当前适配配置不代表 NVIDIA 对千问组合的官方认证。

## 调用链与证据

```text
框选原文
→ 模型提炼意图、保留术语、核实引用
→ 官方 aiq.py helper
→ 本机 AI-Q 研究 Agent
→ paper_search_tool 获取学术来源
→ 带来源 URL 的研究报告
→ 元数据候选检索 + 模型相关性筛选
→ 用户选择、下载和建树
```

论文工具使用 OpenAlex，失败时回退 Crossref；明确 arXiv 编号直接读取公开摘要页。客户端也通过元数据接口查询候选，而不是直接采信模型编出的 PDF 地址。

每个成功研究任务保存 Skill 名称、上游版本、服务地址、时间和报告；异步模式可能有 job ID。界面关联气泡中的「研究记录」展示原报告。后台不可达、官方 helper 失败或报告没有来源时，搜索报错，不绕过 Skill。

## 安装与启动

需要 Git、Node.js 24+、Python 3.11–3.13 和 uv。macOS 上构建上游 NeMo Relay 依赖可能需要 Rust；以固定上游版本的安装输出为准。

```bash
# 从 Paper Tree 项目根目录执行
npm ci
npm run setup:aiq
npm run dev
```

安装脚本固定 AI-Q 提交 `bf4e67d1564ef8d2ec8f65b5f9001e512befc095`，执行 `uv sync --frozen --no-dev --package aiq-api`，再注册本项目的 NAT 工具。已有仓库版本不符时会停止，不覆盖已有修改。

默认安装路径 `.prototype-data/aiq/` 包含上游源码和 `.venv`，**这是运行依赖，不是可随意清空的临时缓存**。AI-Q 自身的任务数据库也写在该目录。

应用打开后启动 `nat serve`，仅绑定 `127.0.0.1:18181`。在界面设置模型接口并「保存并重启」后，自启后台继承同一模型配置。开发环境无预设 Key 时，第一次后台启动可能失败；先完成界面配置再重启。

## 可选开发配置

| 环境变量 | 作用 |
| --- | --- |
| `AIQ_REPO` | 已安装的固定版本 AI-Q 仓库，默认 `.prototype-data/aiq` |
| `AIQ_PYTHON` | 执行官方 helper 的 Python，默认 AI-Q `.venv/bin/python` |
| `AIQ_SERVER_URL` | 使用已有本机后台；不再由客户端启动或关闭该服务 |
| `UV` | 安装脚本使用的 uv 可执行路径 |
| `IEEE_API_KEY` | 客户端可选的 IEEE 元数据检索接口；不提供全文权限 |

若使用已有后台，该后台的模型环境也需单独配置；客户端保存设置不会重配一个外部管理的进程。当前适配只接受 loopback 地址，不支持远程 AI-Q。

## 故障定位

- **未安装 / 可执行文件不存在**：从项目根目录运行 `npm run setup:aiq`。
- **版本不符**：检查 `AIQ_REPO` 是否指向别的 checkout，不要覆盖其中的工作。
- **后台未就绪**：首次启动需要加载依赖；确认模型配置和端口是否被占用。
- **启动失败需要日志**：关闭客户端后，准备模型环境变量，从 AI-Q 目录前台运行下列命令；若使用 `.env`，需自行加载，它不会被 `nat` 自动读取。

```bash
cd .prototype-data/aiq
.venv/bin/nat serve --config_file ../../backend/aiq.yml --host 127.0.0.1 --port 18181
```

- **候选服务超时 / 429**：属于学术来源请求失败，不能推断全文是否收费。
- **换到 Spark 推理接口**：需要另行验证模型的工具调用、JSON 输出、兼容接口及硬件部署；只修改 URL 不代表部署完成。

## 已验证与未实现

2026-09-27 的真实验证使用上述固定 Skill 和 AI-Q、千问以及公开 HorNet 示例，官方 helper 返回带来源报告，最终候选包含 `arXiv:2207.14284`。另有真实桌面阅读建立的 5 节点 / 4 关联样例；FPN 获取曾依赖公开来源手动补入，详见 [测试记录](testing.md)。这些是历史实测结果，不保证公网每次都成功。

尚未实现：DGX Spark 自部署推理、扫描件 OCR、NVIDIA `nemo-retriever`、库内语义检索。左侧根论文搜索只是已有工作区过滤；当前也没有「联网查找新根论文」入口。不能把这些能力作为本版已完成内容介绍。
