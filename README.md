# Paper Tree

**保留阅读现场，让每一次追问成为下一篇论文的入口。**

Paper Tree 是一款桌面论文阅读应用。在 PDF 中框选陌生概念或引用，AI 帮你整理检索目标、寻找相关论文；获取全文后，新论文会加入阅读关系图，随时可以沿着关联返回最初的疑问。

![Paper Tree：PDF 阅读与多层论文关系](docs/images/spark-27b-tree.png)

## 项目与技术说明

| 文档 | 重点内容 |
| --- | --- |
| **[项目说明](docs/project.md)** | 阅读痛点、完整使用场景、核心亮点、架构思路与实现方案 |
| **[部署、优化与技术栈](docs/deployment.md)** | DGX Spark 本地算力、TensorRT-LLM 容器、模型配置、推理优化及技术栈清单 |
| **[Agent Skills 设计与集成](docs/skills.md)** | NVIDIA 官方 Skill、AI-Q / NAT 研究流程、论文工具适配与来源记录 |

延伸阅读：[使用指南](docs/usage.md) · [架构说明](docs/architecture.md) · [示例与验证](docs/testing.md)

## NVIDIA 技术如何参与阅读

Paper Tree 将 **NVIDIA Agent Skills 的研究执行**与 **DGX Spark 上的模型推理**连接到同一条阅读流程中：

| 技术 | 在项目中的作用 | 实现入口 |
| --- | --- | --- |
| **NVIDIA `aiq-research` Agent Skill** | 调用研究后台，返回带来源的报告；报告和 Skill 版本随探索记录保存 | [官方 SKILL.md](vendor/nvidia-skills/aiq-research/SKILL.md)、[桌面适配](src/main/skills.ts) |
| **NVIDIA AI-Q Blueprint / NeMo Agent Toolkit（NAT）** | 运行研究 Agent，组织模型和论文检索工具，为当前选区寻找相关工作 | [Agent 配置](backend/aiq.yml)、[论文检索工具](backend/paper_search.py) |
| **NVIDIA TensorRT-LLM** | 使用官方容器加载开放模型权重，为客户端和 AI-Q 提供统一推理接口 | [启动脚本](deploy/start.sh)、[推理参数](deploy/serve.yml) |
| **NVIDIA DGX Spark** | 承担自部署模型的计算，桌面端通过 SSH 隧道访问推理服务 | [部署步骤](docs/deployment.md) |

研究与推理两层独立配置：AI-Q 在桌面本机随应用启动，模型服务可部署到 Spark。主力部署配置为 **Qwen3.8-27B**。框选截图由支持图片输入的视觉模型识别，模型角色与验证范围在部署文档中单独说明。

每次关联检索都会发起官方 Skill 研究，并与学术索引查询并行执行。研究报告中的 arXiv、DOI 线索经元数据核对后进入候选集合，再按选区相关性排序。用户既能看到论文之间的探索关系，也能查看这次 NVIDIA AI-Q 研究使用的来源。

## 从阅读到探索

**导入 PDF → 框选内容 → 查找相关论文 → 下载并关联 → 继续阅读或返回原文**

- **保留 PDF 原版面**：连续滚动、缩放和矩形框选，已检索的位置保留可点击标记。
- **看清阅读脉络**：用关系图组织论文分支，从子论文返回来源页与选区。
- **围绕问题找论文**：结合选区、论文主题和参考文献生成查询，展示候选来源与关联原因。
- **连接 NVIDIA Agent Skills**：通过 `aiq-research` 执行研究，研究记录可在结果面板中查看。
- **选择自己的模型**：支持 OpenAI 兼容接口，也可连接 DGX Spark 上由 NVIDIA TensorRT-LLM 部署的 Qwen3.8-27B。
- **本机管理阅读资料**：保存 PDF、阅读关系和检索记录，支持标题修改、分支删除及中英文界面。

关系图记录的是你的阅读探索路径，不一定代表正式的文献引用。


### 安装与启动

准备 Node.js **24+**、npm、Git、Python **3.11–3.13** 和 [uv](https://docs.astral.sh/uv/)，然后在项目目录执行：

```bash
npm ci
npm run setup:aiq
npm run build
npm start
```

首次安装会下载 NVIDIA AI-Q 及其依赖。macOS 上部分依赖可能需要 Rust 工具链；详细说明见 [NVIDIA 集成](docs/skills.md)。

### 连接模型

打开右上角 **设置**，填写模型服务信息：

| 配置 | 说明 |
| --- | --- |
| API URL | OpenAI 兼容基础地址，例如 `http://127.0.0.1:8355/v1` |
| API Key | 服务提供的密钥；本仓库的本机推理配置使用占位值 `local` |
| Model | 服务提供的模型 ID；本仓库 Spark 配置返回 `model` |
| 视觉模型 | 用于识别框选截图，需支持图片输入，并可通过同一 API URL 和密钥调用 |

URL 不包含 `/chat/completions`。点击 **保存并重启**，应用和本机研究后台会使用同一模型配置。日常使用无需编辑环境变量。

检索模型需要支持 JSON 输出和工具调用，框选识别需要视觉模型支持图片输入。使用云模型时，填写对应服务商的兼容地址、密钥和模型名。使用自部署模型时，按照 [DGX Spark 部署指南](docs/deployment.md) 启动服务并建立连接。

![在设置中连接模型，API Key 保存后保持隐藏](docs/images/settings.png)

### 探索第一篇论文

**1. 导入并阅读**

点击 **导入根论文**，或拖入含文字层的 PDF。左侧切换工作区，中间查看论文关系，右侧保留 PDF 原版面。可以连续滚动阅读，也可以拖动分隔线调整阅读区域。

![阅读工作区：论文关系图与连续 PDF 阅读](docs/images/reading.png)

**2. 框选想继续了解的内容**

等待论文索引完成，点击底部工具栏的 **箭头＋放大镜**。框选一个完整的方法名、概念或引用，核对截图与识别原文（可编辑），点击 **关联框内内容**。例如，在 SimMIM 中选中 `BEiT [1]`，沿着引用寻找相关方法。

![在 PDF 中框选 BEiT 引用，使用框边按钮查找相关论文](docs/images/area-search.png)

**3. 查看候选，获取全文**

结果面板展示检索意图、引用线索，以及按相关性排序的候选列表。当前论文本身会被排除，每条候选显示来源、相关性评分与关联原因。选择获取 PDF，下载完成后生成子节点；也可展开 **NVIDIA aiq-research · 研究记录** 查看研究依据。

![BEiT 检索结果：来源、参考文献和获取全文入口](docs/images/related-papers.png)

**4. 继续探索，随时回到原文**

在子论文中继续框选，就能形成更深的阅读分支。点击 **回到源论文**，可返回当时的页码和选区；原文上的编号标记保存这次探索，之后可以再次打开。

![从 BERT 返回 BEiT，定位原文中保留的关联选框](docs/images/back-to-source.png)

可以从公开的 [HorNet](https://arxiv.org/abs/2207.14284) 开始，框选首页的 `ConvNeXt`，寻找 *A ConvNet for the 2020s*。更多操作见 [使用指南](docs/usage.md)，更多阅读路径见 [示例与验证](docs/testing.md)。

## 数据与隐私

PDF、阅读关系和检索记录保存在本机。模型密钥经 Electron `safeStorage` 加密保存，界面不会显示已保存密钥的明文。

PDF 文字在本地提取；检索时，识别原文及必要上下文用于模型和 AI-Q 研究，查询词会发送给学术检索来源。选择自部署模型可以在自己的设备上完成推理，但查找与下载公开论文仍需要联网。

第三方 Skill 的版本和许可证见 [vendor/nvidia-skills](vendor/nvidia-skills)。论文全文、个人工作区和模型权重不随仓库分发。
