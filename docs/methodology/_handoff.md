# 交接快照

> 每次会话结束前更新本文件：下次会话从这里继续。

## 最近更新：2026-08-28（配置 schema 机制化）

### 已完成

- **配置 schema 与 overlay 合并语义**（issue #3 已关闭，PR #10，ADR-0007）：Plugin.configSchema + configField（int/string/bool/stringArray/recordOfInt）+ resolveConfig；零配置→全默认、record 深合并、标量/数组替换、未知键聚合报 ConfigError、reload 原子化；zone/abc 插件迁移到 schema 声明；框架级验收测试写法确立；demo 第⑧/⑧b幕；测试 47→58 全绿。
- **pda-runtime 通用扫码工作流引擎**（issue #2 已关闭，PR #9，ADR-0006）：消费 PdaWorkflow 描述符；组合根绑定（onSubmit→receiveViaTask）；feat-inbound 零改动获得 PDA 能力；链式幂等（断网重传领域层不被触达，e2e 断言）。
- **core-task 任务机内核**（issue #1 已关闭，PR #8，ADR-0005）：显式迁移表 + opId 幂等推进；receiveViaTask；demo 第⑥幕。
- 参考资料索引 docs/references.md（PR #7）：理念出处五组 + 任务导向按需阅读地图；本地 Cordis 源码镜像在 `C:\work\OpenCode\deepseek-harness\vendor\cordis`。新会话冷启动：README → ADR → references.md。
- 仓库与机制：公开仓库 CSJ608/CWMS；CI 双检；issue/PR 模板；labels；milestone v0.1；Project 看板 #4（issue 关闭自动归档 Done）；main 分支保护；MIT 许可证。
- 全景：kernel（机制+配置 schema）、core-ledger（账）、core-task（任务）、策略缝三插件（zone/abc/veto）、feat-inbound（纵切片）、pda-runtime（PDA 投影面）、client-registry、八幕 demo。ADR-0001~0007。

### 门禁演练记录

- PR #6→#7→#8→#9→#10：分支 → 本地门禁 → PR → CI 双检 → squash 合并已成惯例。约定见 CONTRIBUTING：代码/契约/配置变更走 PR；交接快照可直接提交。

### 下一步（按优先级）

1. **CI 依赖方向自动守卫**（issue #4）：内核零策略/功能 import、功能不互依、client 半身只过 contracts、包依赖与 ADR-0003 拓扑一致——把铁律从自觉变成 CI 门禁
2. PC 端投影雏形：表格/卡片描述符消费（三端投影的第二端，思路对齐 pda-runtime）
3. 大屏投影增强：task/changed 事件驱动作业看板读模型
4. 探索：GitHub MCP 接入 ZCode（issue #5），验证 AI 闭环管理 issue/PR/看板
