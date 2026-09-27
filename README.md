# Paper Tree

**保留阅读现场，让每一次追问成为下一篇论文的入口。**

Paper Tree 是一款桌面论文阅读应用。在 PDF 中框选陌生概念或引用，AI 帮你整理检索目标、寻找相关论文；获取全文后，新论文会加入阅读关系图，随时可以沿着关联返回最初的疑问。

![Paper Tree：PDF 阅读与多层论文关系](docs/images/spark-27b-tree.png)

## 从阅读到探索

**导入 PDF → 框选内容 → 查找相关论文 → 下载并关联 → 继续阅读或返回原文**

- **保留 PDF 原版面**：连续滚动、缩放和矩形框选，已检索的位置保留可点击标记。
- **看清阅读脉络**：用关系图组织论文分支，从子论文返回来源页与选区。
- **围绕问题找论文**：结合选区、论文主题和参考文献生成查询，展示候选来源与关联原因。
- **连接 NVIDIA Agent Skills**：通过 `aiq-research` 执行研究，研究记录可在结果面板中查看。
- **选择自己的模型**：支持 OpenAI 兼容接口，也可连接 DGX Spark 上由 NVIDIA TensorRT-LLM 部署的 Qwen3.8-27B。
- **本机管理阅读资料**：保存 PDF、阅读关系和检索记录，支持标题修改、分支删除及中英文界面。

关系图记录的是你的阅读探索路径，连线不一定代表正式的文献引用。

## 开始使用

通过源码安装并运行，已在 macOS 上验证。

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

URL 不包含 `/chat/completions`。点击 **保存并重启**，应用和本机研究后台会使用同一模型配置。日常使用无需编辑环境变量。

模型需要支持 JSON 输出和工具调用。使用云模型时，填写对应服务商的兼容地址、密钥和模型名。使用自部署模型时，按照 [DGX Spark 部署指南](docs/deployment.md) 启动服务并建立连接。

### 探索第一篇论文

1. 点击 **导入根论文**，或拖入含文字层的 PDF。
2. 等待论文索引完成，点击底部工具栏的 **箭头＋放大镜**。
3. 框选一个完整的方法名、概念或引用，点击 **关联框内内容**。
4. 查看候选论文及其来源，选择获取 PDF。下载完成后，论文自动加入关系图。
5. 在新论文中继续探索，或点击 **回到源论文** 返回原始选区。

可以从公开的 [HorNet](https://arxiv.org/abs/2207.14284) 开始，框选首页的 `ConvNeXt`，寻找 *A ConvNet for the 2020s*。更多操作见 [使用指南](docs/usage.md)，更多阅读路径见 [示例与验证](docs/testing.md)。

## 数据与隐私

PDF、阅读关系和检索记录保存在本机。模型密钥经 Electron `safeStorage` 加密保存，界面不会显示已保存密钥的明文。

PDF 文字在本地提取；建立索引时，首页内容会发送给你配置的模型。检索时，选区及必要上下文用于模型和 AI-Q 研究，查询词会发送给学术检索来源。选择自部署模型可以在自己的设备上完成推理，但查找与下载公开论文仍需要联网。

## 文档

| 文档 | 内容 |
| --- | --- |
| [使用指南](docs/usage.md) | 阅读、检索、下载、回溯与工作区管理 |
| [DGX Spark 部署](docs/deployment.md) | 使用 TensorRT-LLM 启动本地模型 |
| [NVIDIA 集成](docs/skills.md) | Agent Skill、AI-Q 安装与配置 |
| [架构说明](docs/architecture.md) | 组件职责、数据流与本地存储 |
| [示例与验证](docs/testing.md) | 公开论文示例与验证命令 |

第三方 Skill 的版本和许可证见 [vendor/nvidia-skills](vendor/nvidia-skills)。论文全文、个人工作区和模型权重不随仓库分发。
