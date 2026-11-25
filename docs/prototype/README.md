# DataCube 多看板交互原型

用浏览器打开 `index.html`，或在仓库根目录运行 `python3 -m http.server 8080`，访问 http://localhost:8080/prototype/ 。

视觉样式位于 `theme.css`，参考仓库根目录的 [Coinbase DESIGN.md](../DESIGN.md)。打开原型时使用本机字体。

首页三个结构通过底部切换：A 资产导航优先、B 经营概览优先、C 团队资产优先。URL 参数为 `?variant=A`、`?variant=B` 或 `?variant=C`。

页面不包含 AI 会话、数据探索和 SQL 编辑器。分析与图表生成通过外部 MCP / Skill 使用。

可体验：

- 多看板列表、名称搜索、收藏、归档和恢复。
- 独立看板详情、顶部看板切换、新建空白看板、复制与改名。
- 添加已有共享图表、编辑状态移除图表；操作不影响其他看板。
- 多仓库存和加工看板各自保存仓库筛选。销售与直播使用固定样例窗口。
- 业务知识、数据接入和 AI接入演示，含 MCP / Skill 配置和 API Key 管理。

「业务知识」可阅读四个主题的 Markdown 正文和原文。看板中的「查看口径」打开绑定版本。知识页面仅提供读取。

知识文件放在仓库根目录的 `knowledge/<主题>/v<N>.md`。每份文档以一级标题和一段摘要开头。改动口径时可新增 `v2.md`，并保留图表仍在引用的 `v1.md`。

维护 Markdown 后，在仓库根目录运行以下命令。首次构建需要安装 Markdown 渲染依赖。

```sh
python3 -m pip install 'markdown-it-py>=3,<4'
python3 prototype/build_knowledge.py
```

构建会更新 `prototype/knowledge-data.js`，请将它和 Markdown 一起提交。原型使用生成的内容文件，打开现成页面无需安装依赖。

首页的加工异常可直接打开批次看板。选「二号仓」并点击「查看批次」，可以核对 ERP 合格产出、WMS 入库和加工损耗率，再打开损耗口径。

内置看板可用 `?board=sales`、`?board=channel`、`?board=inventory`、`?board=processing` 独立打开。进入详情后 URL 自动更新。

全部为虚拟数据，操作只保留在当前会话。未实现真实 MCP、Skill 包、鉴权、查询、持久化和布局拖拽。新建看板链接在刷新后不可恢复。Key 是无效演示字符串。
