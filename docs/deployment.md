# DGX Spark 模型部署

[返回 README](../README.md) · [使用指南](usage.md) · [NVIDIA 集成](skills.md)

Paper Tree 支持通过 NVIDIA TensorRT-LLM 在 DGX Spark 上运行模型。默认使用 **Qwen3.8-27B**；也可选择 **Qwen3.5-9B**。Electron 客户端与 NVIDIA AI-Q 共用 OpenAI 兼容接口，切换模型无需修改阅读和检索流程。

## 部署结构

```text
桌面电脑                              DGX Spark
Paper Tree + 本机 AI-Q ── SSH 隧道 ── TensorRT-LLM 容器 → 模型权重
```

模型推理运行在 Spark 上，PDF 阅读、工作区和研究后台运行在桌面电脑上。学术检索和论文下载仍需要网络连接。

## 环境要求

- DGX Spark，以及可供推理使用的 GPU 和内存。
- Docker、NVIDIA Container Toolkit 和可用的 CDI GPU 设备。
- 当前用户有 Docker 执行权限。
- Spark 上有 Python 3 和本仓库的 `deploy/` 目录。
- 桌面电脑可以通过 SSH 连接 Spark。

已验证环境为 GB10 / aarch64、驱动 580.173.02、Docker 29.2.1 和 TensorRT-LLM `1.3.0rc28`。启动脚本通过 `--device nvidia.com/gpu=all` 使用 GPU。在 Spark 上检查：

```bash
docker info
nvidia-ctk cdi list
```

CDI 列表应包含 `nvidia.com/gpu=all`。未配置容器 GPU 支持时，请参考 [NVIDIA CDI 安装说明](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/cdi-support.html)。

## 1. 准备模型权重

默认权重目录为：

```text
~/paper-tree-models/
├── Qwen3.8-27B/
└── Qwen3.5-9B/   # 可选
```

每个模型目录需包含完整的配置、分词器、聊天模板和权重分片。可以使用 ModelScope 下载：

```bash
python3 -m venv .download-venv
.download-venv/bin/pip install modelscope
.download-venv/bin/modelscope download --model Qwen/Qwen3.8-27B \
  --local_dir "$HOME/paper-tree-models/Qwen3.8-27B"
```

如需使用 9B，将模型名和目标目录替换为 `Qwen3.5-9B`。27B 原始权重约 55.6 GB，运行时还需要缓存与推理工作区内存。请等待下载完成后再启动服务。

## 2. 启动推理服务

在 Spark 的项目目录执行：

```bash
docker pull nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc28
bash deploy/start.sh 27b
```

省略参数时也会启动 27B。首次加载包含权重读取和算子预热，需要等待数分钟。容器以前台方式运行并显示日志；服务就绪后，在另一个终端检查：

```bash
curl http://127.0.0.1:8355/v1/models
```

该配置返回的模型 ID 为 `model`。首次预热完成前，接口可能暂时无法连接。

| 环境变量 | 默认值 / 作用 |
| --- | --- |
| `MODEL_ROOT` | `$HOME/paper-tree-models`，权重根目录 |
| `MODEL_PORT` | `8355`，Spark 上的服务端口 |
| `MODEL_CACHE` | `$HOME/.cache/paper-tree-inference`，模板与推理缓存 |
| `TRT_IMAGE` | `nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc28` |

服务仅发布到 Spark 的回环地址，通过 SSH 隧道供桌面电脑访问。启动配置按单用户使用设置，GPU 缓存比例不是进程总内存上限；与其他 GPU 任务共用设备时需预留资源。

## 3. 连接桌面应用

在桌面电脑的终端执行以下命令，将 `YOUR_USER@SPARK_HOST` 替换为自己的 SSH 用户和 Spark 地址，并保持终端运行：

```bash
ssh -N -L 8355:127.0.0.1:8355 YOUR_USER@SPARK_HOST
```

然后在 Paper Tree 的设置中填写：

| 字段 | 值 |
| --- | --- |
| API URL | `http://127.0.0.1:8355/v1` |
| API Key | `local`（当前回环服务未启用 API 鉴权，用作客户端占位值） |
| Model | `model`，或 `/v1/models` 返回的实际 ID |

点击「保存并重启」。应用直接模型请求和本机 AI-Q 研究后台会使用同一接口。

## 4. 验证连接

在已建立隧道的桌面电脑项目目录执行：

```bash
python3 deploy/smoke.py
```

脚本检查模型 ID、纯系统提示、JSON 输出与工具调用往返。默认接口是 `http://127.0.0.1:8355/v1`，可通过 `MODEL_URL`、`MODEL_ID`、`MODEL_API_KEY` 和 `MODEL_TIMEOUT` 覆盖配置。工具返回使用固定数据，不执行真实论文检索。

连接检查通过后，在应用中按 [公开论文示例](testing.md) 完成一次框选、搜索和下载，即可验证完整流程。

## 切换与停止

```bash
# 在 Spark 上停止当前模型
docker stop paper-tree-llm
# 切换到 9B
bash deploy/start.sh 9b
# 切回 27B 时先停止现有容器，再运行
# bash deploy/start.sh 27b
```

两个模型使用相同容器名与端口，按顺序切换，不同时启动。服务模型 ID 保持相同时，桌面应用无需更改配置。

## 配置说明与性能

`deploy/start.sh` 使用 NVIDIA 原始镜像，模型权重以只读方式挂载。脚本在缓存目录生成兼容模板，关闭思考模式，并兼容 AI-Q 只包含系统消息的请求。Qwen 工具调用使用 `qwen3_coder` 解析器；单用户缓存参数位于 `deploy/serve.yml`。

已验证镜像摘要为 `sha256:a1f43376f0fd5719baaa258774249b1f8e0015783b76332c4927608545f90a80`，可通过 `TRT_IMAGE` 使用带摘要的镜像地址固定版本。

27B 原始权重的实际检索为分钟级交互，耗时随输入长度、输出长度和学术来源响应变化。在已验证环境中，短协议请求约 2–11 秒，单轮研究结果整理约 27–79 秒，较长回复曾达到 4–5 分钟。这些是不同请求的观测值，不是标准性能基准。完整阅读示例见 [示例与验证](testing.md)。

## 常见问题

- **Docker 权限不足**：确认当前 SSH 用户具有 Docker 权限；权限调整后重新登录。
- **找不到 GPU 设备**：检查 NVIDIA Container Toolkit 和 CDI 设备列表。
- **模型接口无法连接**：检查容器是否完成预热、端口是否一致，以及 SSH 隧道是否仍在运行。
- **提示模型不存在**：以 `/v1/models` 返回的 ID 为准，不使用权重目录名代替。
- **研究等待较长**：27B 原始权重需要较长生成时间。应用允许研究调用等待最多 10 分钟；服务日志可用于区分正在推理与连接失败。

## 参考资料

- [NVIDIA Spark TensorRT-LLM 指南](https://build.nvidia.com/spark/trt-llm/instructions)
- [NVIDIA Qwen 部署指南](https://nvidia.github.io/TensorRT-LLM/latest/deployment-guide/deployment-guide-for-qwen3.8-qwen3.5-on-trtllm.html)
- [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B)
- [Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
