# 自托管增量补丁（上游合入至 8f4165229dabfba741fe9fcac993ad1fd272a21b）

本分支只恢复 V3 的显式本地注册、同源 WebSocket 和 Docker 部署，不回退新版玩法。

## 本次发布状态（2026-11-12）

本次按维护者要求合入上游协议 v109 / MCP 0.2.8，仅进行静态判断与合并后发布，未运行测试。保留 V3 的显式本地注册、同源 WebSocket、Docker 两文件部署、PostgreSQL 16、原卷、端口与国内 npm 可配置镜像。不是已通过部署验收的版本。

本轮未运行后端全量单测/类型检查、前端类型检查/单测/同源生产构建、Docker 后端编译、镜像构建/运行时、PostgreSQL 16 迁移和浏览器端到端测试。2026-10-25 旧基线的 529 项非数据库测试与 7 项前端测试等历史结果不适用于本轮新代码。此次未部署 NAS，也未访问正式数据库。

### 升级前需要理解的新规则

- 本轮 v103–v109 调整战损、在野名将独立获取、老巢梯度与压制，新增元宝和兑换码。新增名将归属主键、老巢战力、元宝 / 付费道具及充值 / 兑换表迁移；元宝及充值 / 兑换记录跨季保留，元宝购买的道具跨季保留。未验证旧存档迁移。
- 本模板不传入支付渠道配置，不会自动开启真实充值；也没有 `/pay/` 回调代理。充值面板可能显示不可用入口，兑换码由本地运营生成。详见 [兑换码运维手册](docs/redeem-ops.md)。
- 上游新增隐私 / 条款 / 定价页仍使用商业站文案，包含退款、第三方登录、HTTPS 等表述，与本地密码 / HTTP 自托管不完全一致；本次未作商业运营适配，对外运营前应自行审阅调整。

- v98 会收回本人和 Agent 都超过现实时间 7 天未活跃账号的全部野地，销毁望楼不退款，驻军退回所属城；城池和城内资源不动。Worker 启动约一小时后开始首轮检查，随后每小时检查，旧存档中已超阈值的账号也适用。
- 在野名将忠诚度耗尽或被俘逾期可能离队。见 [11 月 6 日说明](deploy/2026-11-06/announcement-zh.md)。
- 五方势力开关 `faction_enabled` 默认关闭，本次不改变开关。启用后会扩张、围攻并吞并普通分城；v102 从开启当天计算势力天数，满 7 天才开始围攻。见 [11 月 8 日说明](deploy/2026-11-08/announcement-zh.md)。
- API 启动会执行新增表/列及一次性迁移，例如主城酒馆/书院合并、分城相关队列取消退款、礼金和迷雾记录初始化。正式升级前建议在隔离新卷恢复备份，检查迁移与上述 Worker 规则。

## 两文件部署

本地部署目录只需要本分支的 `Dockerfile`、`compose.yaml` 和原来的 `.env`。
Docker 构建会从 `https://github.com/coracoo/slg` 下载指定提交源码，包含 nginx 配置与编译配置；不需要手动下载源码 ZIP。

1. 使用 fork 已发布的 `selfhost` 分支的两文件，确认默认源码 SHA 是完整 40 位值。
2. 部署文件固定一个已存在的源码提交，固定 SHA 不代表已完成部署验收；当前验证状态见上文。若仅拿到含 `REPLACE_WITH_PUBLISHED_SELFHOST_COMMIT_SHA` 的开发模板，必须等源码发布后替换 Dockerfile 与 Compose 中全部占位符。也可以通过 `SLG_SOURCE_REF` 环境变量指定新的已发布提交。不要填无补丁的上游基线 SHA，也不要用可变分支名。
3. 将两文件放在原部署目录，保留 `.env`。Compose 项目名仍是 `slg`，服务仍为 db/api/worker/frontend，卷仍为 `postgres-data`，PostgreSQL 默认仍为 `postgres:16-alpine`。
4. 构建需要 NAS 能访问 GitHub、镜像仓库及 npm。默认 npm 沿用 V3 的 npmmirror 国内镜像，不保证 GitHub 和基础镜像在国内的可达性；已有 `NPM_REGISTRY` 环境变量覆盖继续有效。

发布采用两步：源码提交 A 包含应用与 docker 辅助配置；后续配置提交 B 将两文件默认 SHA 固定到 A。因此最终交付的两文件无需再填占位符，B 构建 A 的固定源码，避免循环引用自身 SHA。若你看到占位符，说明拿到的是发布前模板，请勿直接部署。后续上游更新见下方说明。

## 如何跟进上游

上游同步只维护 `selfhost`，不修改 `main`，不使用 GitHub Actions。具体执行范围以维护者最新授权为准；本次明确要求只判断和更新，不以运行测试作为发布门槛，所有未测试范围如上披露。

保留自托管差异，发布前核对远端 HEAD，只允许快进，不覆盖并发修改。无法判断合并、无法保护已有改动或不能确保不触发 Actions 时停止发布。源码提交之后的配置提交将 Dockerfile/Compose 固定到已存在的完整源码 SHA；固定 SHA 不代表已经验收。

**NAS 升级由你决定并手动执行。** 保留原 `.env`、数据库和部署备份，核对是否存在 `SLG_SOURCE_REF` 覆盖值，再决定是否构建和启动。只重启或 `docker compose pull` 不会更新固定 SHA 构建的应用代码。

## 升级前必须核对

不要直接覆盖自行改过的现用 Compose。先比较项目名、服务名、实际数据卷、端口、数据库用户/库名及全部环境变量；本模板继承的是提供的 V3 Compose，不能代替核对 NAS 实际配置。旧模板固定数据库名和用户均为 `slg`，数据库密码继续来自原 `.env` 的 `POSTGRES_PASSWORD`。不要把旧密码重新生成或替换。不要更改已有 `POSTGRES_IMAGE` 到不同主版本。

在原部署目录执行只读检查（不要把含密码的输出分享）：

```sh
docker compose config --quiet
docker compose ps
docker compose exec -T db psql -U slg -d slg -c 'SELECT count(*) AS world_tiles FROM world_tiles;'
```

V3 与本基线的 WORLD_SIZE 都是 1000，正常世界必须为 1,000,000 个地块。
上游 `ensureWorld` 在地块数不符时会自动重建世界，领地/行军会被清除、城池位置会重排。若地块数不符，停止升级并调查，不要尝试启动新 API/Worker。

升级前停止 API/Worker 写入并做数据库备份，同时保留原 Compose、Dockerfile、.env 和旧镜像。建议先在隔离的新卷恢复备份并验证，绝不能让试运行连接正式数据库。

```sh
docker compose stop frontend api worker
docker compose exec -T db pg_dump -U slg -d slg -Fc > slg-before-upgrade.dump
# 确认备份成功且非空；建议实际恢复演练，然后才继续。
docker compose build api worker frontend
docker compose up -d
docker compose ps
```

这些命令只是部署步骤，交付过程中没有在你的 NAS 执行。禁止 `docker compose down -v`；它会删除存档卷。若数据库结构已由新版修改，仅回滚镜像不保证兼容，应在隔离环境验证备份恢复方案。

## 赛季、联盟与存档迁移

本次合入协议 v109 / MCP 0.2.8。`ensureSchema` 会自动建赛季、联盟相关表并为已有表加列；请先在隔离 PostgreSQL 16 新卷中恢复备份验证，不能只凭源码测试通过就升级原卷。

Compose 将 `.env` 的 `SEASON_1_START`、`SEASON_1_END`、`SEASON_LENGTH_DAYS` 同时传给 API 和 Worker。前两项仅在 `seasons` 为空时播种第 1 季生效，默认从首次启动开始、28 天后结束；后续赛季长度默认也是 28 天。不要直接复制上游已过期的示例日期。已有赛季不会因改 `.env` 重置或改变结束时间。

镜像内包含编译后的赛季运维脚本。API 已完成迁移后查看状态：

```sh
docker compose exec -T api node dist/scripts/season.js status
```

注意该上游脚本先执行幂等 `ensureSchema`，不是对尚未迁移数据库的纯只读探针。仅在确定要修改赛季时间时使用 `set-end`；不要误执行 `end-now`。赛季到期后 Worker 会归档并重置世界，清除城池、资源、军队、武将等本赛季进度（账号与永久 Agent 令牌保留），不能把它当成普通应用重启。

只允许同一数据库同时运行一个 Worker。Compose 先等 API 健康，再启动唯一 Worker；不要另起手工 Worker 或扩容副本。升级后检查密码登录/注册、同源 WebSocket、赛季提示、联盟面板/聊天/排行榜。详见 [赛季设计](docs/season-system.md) 与 [联盟发布说明](deploy/2026-10-25/README.md)。

## 注册与访问

保留 `.env` 原配置。仅当 `LOCAL_PASSWORD_SIGNUP_ENABLED=true` 时显示注册入口；默认关闭。注册明确发送 `register: true`，普通登录不会自动新建账号。已有账号和密码哈希保持原样，新增账号复用上游账号/城池/Agent token 创建事务。

注册限流为每 API 进程每 IP 每 10 分钟最多 5 次、全局最多 30 次，重启会重置；本 Compose 只有一个 API。多个副本或公开高流量环境需要另行设计共享限流。Nginx 覆盖转发的客户端地址，API 不向宿主机发布端口，避免直接伪造代理来源绕过限流。

入口默认 `http://NAS地址:8424`；同源 WebSocket 使用相同主机和端口。浏览器历史 `slg.wsUrl` 覆盖项在自托管同源模式不生效。外层反向代理后所有用户可能共享该代理的 IP 配额（更严格）；HTTPS 需在外层可信反向代理配置 WebSocket；OAuth 的 FRONTEND_URL 与回调地址应为实际访问地址。

## 验证边界

本次只有源码差异与合并、协议文档副本、工作流条件、远端提交和部署引用的静态核对，没有运行应用测试、编译、镜像、数据库迁移或浏览器端到端验证。不能把静态文件核对称为 `docker compose config`、镜像构建或真实数据库测试。未访问、启动或修改你的 NAS、正式数据库和原存档。
