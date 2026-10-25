# 自托管增量补丁（上游合入至 248a7bc200239c65f1fe065813d633ee1c93dfad）

本分支只恢复 V3 的显式本地注册、同源 WebSocket 和 Docker 部署，不回退新版玩法。

## 本次发布状态（2026-10-25）

本次按维护者要求先更新 `selfhost` 与固定源码引用，属于**待部署验收版本**，不是已完成上线验证的版本。后端非数据库测试 529 项、前端单元测试 7 项、类型检查、同源前端生产构建和 Docker 后端编译配置检查已通过。17 个真实数据库测试套件未运行；Docker 镜像构建/运行时未验证；浏览器端到端测试因云端进程套接字限制未能启动。升级原存档前，仍须完成隔离 PostgreSQL 16 迁移、容器运行和浏览器验收。此次只发布仓库代码，未部署 NAS；后续自动更新的验证门槛不变。

## 两文件部署

本地部署目录只需要本分支的 `Dockerfile`、`compose.yaml` 和原来的 `.env`。
Docker 构建会从 `https://github.com/coracoo/slg` 下载指定提交源码，包含 nginx 配置与编译配置；不需要手动下载源码 ZIP。

1. 使用 fork 已发布的 `selfhost` 分支的两文件，确认默认源码 SHA 是完整 40 位值。
2. 部署文件固定一个已存在的源码提交，固定 SHA 不代表已完成部署验收；当前验证状态见上文。若仅拿到含 `REPLACE_WITH_PUBLISHED_SELFHOST_COMMIT_SHA` 的开发模板，必须等源码发布后替换 Dockerfile 与 Compose 中全部占位符。也可以通过 `SLG_SOURCE_REF` 环境变量指定新的已验证提交。不要填无补丁的上游基线 SHA，也不要用可变分支名。
3. 将两文件放在原部署目录，保留 `.env`。Compose 项目名仍是 `slg`，服务仍为 db/api/worker/frontend，卷仍为 `postgres-data`，PostgreSQL 默认仍为 `postgres:16-alpine`。
4. 构建需要 NAS 能访问 GitHub、镜像仓库及 npm。默认 npm 沿用 V3 的 npmmirror 国内镜像，不保证 GitHub 和基础镜像在国内的可达性；已有 `NPM_REGISTRY` 环境变量覆盖继续有效。

发布采用两步：源码提交 A 包含应用与 docker 辅助配置；后续配置提交 B 将两文件默认 SHA 固定到 A。因此最终交付的两文件无需再填占位符，B 构建 A 的固定源码，避免循环引用自身 SHA。若你看到占位符，说明拿到的是发布前模板，请勿直接部署。后续上游更新见下方说明。

## 如何跟进上游

上游同步由仓库外部的 dot 云端定时任务执行：每天北京时间（Asia/Shanghai）上午 10 点左右检查，实际运行可能在一小时内浮动，不使用 GitHub Actions。任务直接将 `athlan20/slg` 的 `main` 合入本仓库 `selfhost`，本仓库 `main` 保持原样；在云端合并、测试与验证通过后才推送，并通过后续配置提交将部署文件固定到新的已验证完整源码 SHA。

没有上游新版本时静默跳过。定时运行不保证每次都能成功发布：遇到合并冲突、测试失败或关键验证不可用时停止发布，并通知阻断原因。

**NAS 部署仍由你手动完成。** 获取更新后的 `Dockerfile` 与 `compose.yaml`，按升级指南核对配置、备份并完成隔离验证，再手动构建和启动。若 `.env` 中设置了 `SLG_SOURCE_REF`，它会覆盖部署文件的默认值，需同步核对。

备用手动更新方法：将 `athlan20/slg` 的 `main` 合入 `selfhost`、处理冲突并验证，再将部署配置的 `SLG_SOURCE_REF` 固定为新的完整 40 位源码 SHA，重新构建和启动。

仅重启容器或执行 `docker compose pull` 不会更新固定 SHA 构建的应用源码，不要将 `SLG_SOURCE_REF` 改为可变分支名。

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

## 本次赛季与联盟升级

本次合入协议 v70 / MCP 0.1.6。`ensureSchema` 会自动建赛季、联盟相关表并为已有表加列；请先在隔离 PostgreSQL 16 新卷中恢复备份验证，不能只凭源码测试通过就升级原卷。

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

交付报告单独列出实际运行的源码测试、TypeScript 检查与前端构建结果。本云端没有 Docker/Podman、PostgreSQL 或 Nginx，不能把静态 YAML 检查称为 `docker compose config`、镜像构建、真实数据库并发测试或浏览器端到端测试。正式升级前仍须在隔离测试部署完成这些验证。
