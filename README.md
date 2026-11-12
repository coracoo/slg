# SLG · Selfhost 自托管版

SLG 是可由玩家或 AI Agent 游玩的三国策略游戏。本分支合入 [athlan20/slg 的上游版本](https://github.com/athlan20/slg/tree/8f4165229dabfba741fe9fcac993ad1fd272a21b)，保留新版玩法，补充面向 NAS / 私有服务器的自托管支持。

游戏介绍、截图与玩法见 [上游中文说明](https://github.com/athlan20/slg/blob/8f4165229dabfba741fe9fcac993ad1fd272a21b/README.md)；原项目：[athlan20/slg](https://github.com/athlan20/slg)。

## 本分支提供什么

- **本地账号注册**：`LOCAL_PASSWORD_SIGNUP_ENABLED=true` 时开放，默认关闭；普通登录不会自动创建账号。
- **保留原密码登录**：已有账号和密码哈希沿用原数据库，无需重置；Google / GitHub 登录配置也可继续使用。
- **同源 WebSocket**：网页与 WebSocket 共用访问域名和端口，适合 NAS 与反向代理部署。
- **两文件构建部署**：本地只需 `Dockerfile`、`compose.yaml` 和原来的 `.env`，构建时自动下载固定提交源码，无需手动下载源码包。

## 本次上游更新

**2026-11-12：本次按维护者要求，仅进行静态判断与合并后发布，未运行测试。合入协议 v109 / MCP 0.2.8；这不是已通过运行验证或生产存档升级验收的版本。**

- 保留本地注册开关、已有账号登录、同源 WebSocket、Docker 两文件部署和可配置 npm 镜像。数据库仍为 PostgreSQL 16，原卷、端口和默认配置不变。
- 本轮从 v102 更新至 v109：战损按兵力比例折算，29 名在野名将改为各账号独立获取，老巢加入梯度战力和压制档，战场展示入场编成；新增元宝、兑换码与支付接口，迁城令价格调整。详见 [11 月 11 日说明](deploy/2026-11-11/announcement-zh.md) 与 [Agent API](docs/agent-api.md)。
- **真实充值不会随本模板自动开启**：现有 Compose 不传入支付渠道配置，缺少配置时支付服务关闭；兑换码仍由本地运营生成与兑换。充值卡可能显示，但会提示渠道不可用。本模板也未添加 `/pay/` 回调代理，若未来经营收费服务，需要另行完整配置。
- **商业文案尚未适配自托管**：上游新增隐私、条款、定价页面，包含商业退款、第三方登录和 HTTPS 等表述，不完全符合本地密码 / HTTP 自托管环境。本次仅同步代码，不代表启用收费服务；对外运营前应自行审阅并调整这些页面。
- 本轮新增名将归属主键、老巢战力、元宝 / 付费道具及充值 / 兑换码表的迁移。元宝和充值 / 兑换记录跨季保留，元宝购买的道具跨季保留；未验证旧存档迁移。
- **升级后长期不活跃账号会失去野地**：本人和 Agent 都超过现实时间 7 天未活跃时，Worker 每小时检查并收回全部野地、销毁望楼且不退款；驻军回到所属城，城池与城内资源保留。Worker 启动约一小时后开始首轮检查，旧存档中已超过阈值的账号也适用。
- **名将有忠诚度和被俘规则**：在野名将忠诚度耗尽或被俘逾期可能离队。请阅读 [11 月 6 日说明](deploy/2026-11-06/announcement-zh.md) 和 [11 月 7 日说明](deploy/2026-11-07/announcement-zh.md)。
- 五方势力受 `faction_enabled` 控制，默认关闭；启用后可能围攻并吞并普通分城。v102 从当季启用当天计算势力天数，满 7 天后才开始围攻，见 [11 月 8 日说明](deploy/2026-11-08/announcement-zh.md)。本次不修改该开关。
- API 启动会执行表结构及存量数据迁移，包括主城酒馆/书院合并与队列退款、礼金、迷雾和势力相关数据。请先备份，并在隔离 PostgreSQL 16 数据库检查旧存档升级。
- 同一数据库同一时刻只运行一个 Worker。不要照抄过期赛季日期，不要误执行 `end-now`。
- 本分支不导入上游 GitHub Actions 工作流；上游公告、npm 发布及正式服务部署步骤不属于本次仓库同步。

## 部署

需要 Docker Compose，以及访问 GitHub、容器镜像仓库和 npm 的网络。

1. 下载本分支的 [Dockerfile](Dockerfile) 和 [compose.yaml](compose.yaml)，放入原部署目录，保留原 `.env`。已有部署请先按下方升级注意事项备份、核对配置，再替换文件。
2. `.env` 必须提供 `POSTGRES_PASSWORD`；已有部署继续使用原密码。新装请自行设置强密码。需要开放本地注册时添加：

   ```dotenv
   LOCAL_PASSWORD_SIGNUP_ENABLED=true
   ```

3. 完成配置核对后，在部署目录执行：

   ```sh
   docker compose config --quiet
   docker compose build api worker frontend
   docker compose up -d
   docker compose ps
   ```

访问 `http://NAS地址:8424`。首次构建和启动可能需要较长时间。

默认配置：

- 项目名 `slg`，服务 `db / api / worker / frontend`，数据卷 `postgres-data`；数据库用户和库名均为 `slg`。
- PostgreSQL 使用 `postgres:16-alpine`，沿用原卷；不要直接切换现有数据库的主版本。
- 网页端口 `8424`，可通过 `SLG_PORT` 修改；`SLG_BIND_IP` 默认 `0.0.0.0`，请按需限制网络访问。
- npm 默认使用 `https://registry.npmmirror.com`，可通过 `NPM_REGISTRY` 覆盖。这不保证 GitHub 或容器镜像仓库在国内可达。
- 默认构建源码固定为 [`8811cd3e42a7ec431fc5bb2dfbe59d3fe99fcf2a`](https://github.com/coracoo/slg/commit/8811cd3e42a7ec431fc5bb2dfbe59d3fe99fcf2a)，可通过 `SLG_SOURCE_REF` 指定已发布的完整 40 位提交 SHA；固定版本不代表已经通过测试。

HTTPS 请在外层可信反向代理配置，并启用 WebSocket 转发；使用 OAuth 时，将 `FRONTEND_URL` 和回调地址设为实际访问地址。

## 升级与数据安全

**已有存档请先阅读 [详细迁移指南](README.Selfhost.zh-CN.md)，不要直接覆盖自行修改过的 Compose。**

- 核对实际项目名、数据卷、端口、数据库凭据和环境变量，避免误连新卷或错误数据库。
- 升级前停止 API / Worker 写入，备份数据库，并保留原部署文件、`.env` 和旧镜像；建议先在隔离新卷恢复备份试运行。
- 升级前确认世界地块数为 **1,000,000**。数量异常时，新版初始化可能重建世界并清除领地 / 行军，应停止升级并调查。
- **不要执行 `docker compose down -v`，它会删除存档卷。** 数据库结构发生变化后，仅回滚镜像不保证兼容。

## 如何跟进上游

上游同步只维护 `selfhost`，不修改本仓库 `main`，不使用 GitHub Actions。具体执行范围以维护者最新授权为准；本次依明确指示不以运行测试作为发布门槛，发布记录应如实注明未测试。

没有上游新版本时静默跳过。无法判断合并、不能保护自托管改动、发现并发更新，或无法确保不触发 Actions 时停止发布并说明原因。源码合并提交之后，再以配置提交将部署文件固定到该完整源码 SHA，不使用可变分支名。

**NAS 部署仍由你手动完成。** 获取更新后的 `Dockerfile` 与 `compose.yaml`，按升级指南核对配置和备份，再决定是否构建和启动。若 `.env` 中设置了 `SLG_SOURCE_REF`，它会覆盖部署文件的默认值，需同步核对。

仅拉取新 README、重启容器或执行 `docker compose pull`，不会自动更新固定 SHA 构建的应用源码。不要把 `SLG_SOURCE_REF` 改成可变分支名。

## 验证范围与文档

本次只做提交来源、三方合并、自托管差异和发布引用的静态核对。**未运行后端全量单测/类型检查、前端类型检查/单测/生产构建、Docker 后端编译、Docker 镜像或运行时、PostgreSQL 16 迁移及浏览器端到端测试。** 旧版本的测试结果不能代表本版本。此次仅更新仓库，未操作 NAS 或正式数据库；部署前请保留备份并自行决定隔离验收。

- [详细部署、备份与迁移指南](README.Selfhost.zh-CN.md)
- [Agent API](docs/agent-api.md) · [MCP 配置](mcp/README.md)
- [后端配置](backend/README.md) · [前端说明](frontend/README.md)
- [兑换码（礼券）运维手册](docs/redeem-ops.md)：批量生成、导出、查码、作废与对账

## 许可证

沿用原项目的 [MIT License](LICENSE)。
