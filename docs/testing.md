# 测试与验收

## 固定检索样例

- 根论文：**YOLO-HMC: An Improved Method for PCB Surface Defect Detection**。
- DOI：`10.1109/TIM.2024.3351241`。
- PDF：使用当前已经导入的 11 页版本，不用重新下载付费全文。
- 固定关键词：**HorNet**，选择 PDF 第 1 页中完整的这个单词，不添加 PCB、YOLO 等关键词。
- 固定参考文献：[31]，含 `arXiv:2207.14284`。
- 预期目标：[HorNet: Efficient High-Order Spatial Interactions with Recursive Gated Convolutions](https://arxiv.org/abs/2207.14284)。arXiv 版本尾缀可以变化。

## 手工验收（按顺序）

| 步骤 | 操作 | 通过标准 |
|---|---|---|
| 1 | 启动客户端，打开上述根论文 | 显示 PDF 原版面、主题，当前版本参考文献缓存为 45 条 |
| 2 | 鼠标/触控板向下滚动 | 连续看到第 2、3 页；没有必须点击的下一页按钮；顶部页码跟随滚动 |
| 3 | 回到第 1 页，划选 `HorNet`，点击「关联选中内容」 | 右侧浮动气泡打开，PDF 宽度不变；不出现聊天输入框 |
| 4 | 检查候选、依据和来源 | 命中参考文献 [31]，出现上述 HorNet 论文及关联原因；不返回 YOLO-HMC 自身、洋葱路由 HORNET 或无关 PCB 论文 |
| 5 | 收起气泡，再点「关联结果」 | 正文阅读位置保留，可以重新查看同一批候选 |
| 6 | 对正确 HorNet 候选点「获取 PDF 并关联」 | 打开获取窗口，公开 PDF 下载完成后出现子论文行、连接线和来源页码；悬停可查看完整标题与关联原文 |
| 7 | 从子论文点「回到源论文 p.1」 | 返回 YOLO-HMC 第 1 页；当前路线高亮 |
| 8 | 退出并重启 | 两篇论文及关系仍在；已有索引从 SQLite 读取，不重复生成 |

若只验证检索、不希望新增节点，在步骤 5 后停止。重复执行下载会生成新分支，当前原型没有全局论文合并功能。

## 命令行验证

```bash
npm run build
npm test
npm run test:desktop
npm run test:api
# 用自己的同版本 PDF 验证真实参考文献提取：
npm run test:api -- "/absolute/path/to/YOLO-HMC.pdf"
```

- `test:desktop`：独立临时工作区、两页合成 PDF、本地模型响应及出版商页面。验证连续滚动、气泡宽度/收起、真实 Cookie 登录下载、递归关联、返回来源页和重启。它不验证真实学校登录。
- `test:api`：默认用固定书目信息与真实千问、arXiv / Crossref 查询；指定 PDF 才测试真实索引。会产生少量接口用量，指定 PDF 时首页与检索所需文献信息会发往配置的模型接口。
- 记录失败阶段：索引 / 检索网络 / 相关性 / 获取权限 / 下载 / 建树。网络错误不能当作论文无权限；候选标题和 URL 是判定依据，不比较模型说明逐字一致。

## 机构登录专项测试（单独执行）

由用户选择学校确实订阅、且当前需要登录的 IEEE 论文。记录 DOI、访问方式（校园网/VPN/图书馆代理/机构 SSO）、是否先前已登录。

1. 在 Paper Tree 获取窗口中使用机构登录，确认页面能访问全文。
2. 点击出版商实际的 PDF 下载入口；只有浏览器开始下载且下载完成后，才应生成树节点。
3. 关闭获取窗口后再次打开同一来源，检查有效会话能否复用；是否需重新登录由学校和出版商决定。
4. 若应用内登录不兼容，使用系统浏览器下载，再「手动补入 PDF」。外部浏览器的下载不会被 Electron 捕获。

不能用这个用例推断“任意学校账号都可下载任意 IEEE 论文”。

## 多分支密度验收（真实论文）

现已实际建立 15 个论文节点、14 条关联，一级入口为 CARAFE、YOLOv6、HorNet、CBAM、SSD，二级分别为 2、1、3、2、1 个节点。完整标题、URL 和来源页见 本文后面的实测记录。

- 1480×980 窗口：全部展开的树内容高 482 CSS px，15 行同时可见。
- 1050×700 窗口：树区可见高 395 CSS px，内容独立滚动，PDF 阅读区保持正常。
- 收起 HorNet：15 行变为 12 行；展开恢复 15 行。
- 关联气泡打开时，在 PDF 上按下鼠标准备新划选，气泡立即收起；阅读区宽度不变。

截图：[全展开](preview.png)。样例在 `.prototype-data/branching-demo`，已被 Git 忽略，不包含在提交源码中；原有工作区未修改。

## 真实多分支树实测

根论文：YOLO-HMC: An Improved Method for PCB Surface Defect Detection

使用现有 research / workflow 检索与建树函数；公开 PDF 由测试脚本下载后交给 importPaper。没有逐条模拟鼠标点击下载。原有用户工作区未修改。

| 源论文/概念 | 划选词 | 来源页 | 实际关联论文 |
|---|---|---|---|
| YOLO-HMC | CARAFE | 1 | [CARAFE: Content-Aware ReAssembly of FEatures](https://arxiv.org/abs/1905.02188v3) |
| YOLO-HMC | YOLOv6 | 11 | [YOLOv6: A Single-Stage Object Detection Framework for Industrial Applications](https://arxiv.org/abs/2209.02976v1) |
| YOLO-HMC | HorNet | 1 | [HorNet: Efficient High-Order Spatial Interactions with Recursive Gated Convolutions](https://arxiv.org/abs/2207.14284v3) |
| YOLO-HMC | CBAM | 1 | [CBAM: Convolutional Block Attention Module](https://arxiv.org/abs/1807.06521v2) |
| CARAFE | Feature Pyramid Network | 1 | [Feature Pyramid Networks for Object Detection](https://arxiv.org/abs/1612.03144v2) |
| CBAM | Squeeze-and-Excitation | 4 | [Squeeze-and-Excitation Networks](https://arxiv.org/abs/1709.01507v4) |
| YOLOv6 | RepVGG | 2 | [RepVGG: Making VGG-style ConvNets Great Again](https://arxiv.org/abs/2101.03697v3) |
| YOLO-HMC | SSD | 2 | [SSD: Single Shot MultiBox Detector](https://arxiv.org/abs/1512.02325v5) |
| HorNet | Swin Transformer | 2 | [Swin Transformer V2: Scaling Up Capacity and Resolution](https://arxiv.org/abs/2111.09883v2) |
| HorNet | ResNet | 8 | [Deep Residual Learning for Image Recognition](https://arxiv.org/abs/1512.03385v1) |
| CARAFE | Mask R-CNN | 1 | [Mask R-CNN](https://arxiv.org/abs/1703.06870v3) |
| CBAM | ResNet | 1 | [Deep Residual Learning for Image Recognition](https://arxiv.org/abs/1512.03385v1) |
| SSD | Faster R-CNN | 1 | [Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks](https://arxiv.org/abs/1506.01497v3) |
| HorNet | ConvNeXt | 1 | [A ConvNet for the 2020s](https://arxiv.org/abs/2201.03545v2) |

共 15 个阅读节点、14 条关联；ResNet 经两条阅读路径到达，保留两个节点。Swin Transformer 分支实际候选是 Swin Transformer V2，完整标题可在悬停和阅读区核对。

本机已生成样例（`.prototype-data/` 不随仓库提交；新克隆请按 本文前面的测试 SOP 建立阅读树）：
```bash
PAPER_TREE_DATA_DIR="$PWD/.prototype-data/branching-demo" npm start
```

