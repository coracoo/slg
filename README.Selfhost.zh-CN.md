# 自托管增量补丁（基线 b255ea9f7fec3fb71060176a86850ed52287b973）

本分支只恢复 V3 的显式本地注册、同源 WebSocket 和 Docker 部署，不回退新版玩法。

## 两文件部署

本地部署目录只需要本分支的 `Dockerfile`、`compose.yaml` 和原来的 `.env`。
Docker 构建会从 `https://github.com/coracoo/slg` 下载指定提交源码，包含 nginx 配置与编译配置；不需要手动下载源码 ZIP。

1. 使用 fork 已发布的 `selfhost` 分支的两文件，确认默认源码 SHA 是完整 40 位值。
2. 正式交付已固定审核过的源码提交。若仅拿到含 `REPLACE_WITH_PUBLISHED_SELFHOST_COMMIT_SHA` 的开发模板，必须等源码发布后替换 Dockerfile 与 Compose 中全部占位符。也可以通过 `SLG_SOURCE_REF` 环境变量指定新的已验证提交。不要填无补丁的上游基线 SHA，也不要用可变分支名。
3. 将两文件放在原部署目录，保留 `.env`。Compose 项目名仍是 `slg`，服务仍为 db/api/worker/frontend，卷仍为 `postgres-data`，PostgreSQL 默认仍为 `postgres:16-alpine`。
4. 构建需要 NAS 能访问 GitHub、镜像仓库及 npm。默认 npm 沿用 V3 的 npmmirror 国内镜像，不保证 GitHub 和基础镜像在国内的可达性；已有 `NPM_REGISTRY` 环境变量覆盖继续有效。

发布采用两步：源码提交 A 包含应用与 docker 辅助配置；后续配置提交 B 将两文件默认 SHA 固定到 A。因此最终交付的两文件无需再填占位符，B 构建 A 的已审核源码，避免循环引用自身 SHA。若你看到占位符，说明拿到的是发布前模板，请勿直接部署。后续上游更新：合并上游到 selfhost、处理冲突并验证，再把部署端 SHA 换为新提交并重新构建。

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

## 注册与访问

保留 `.env` 原配置。仅当 `LOCAL_PASSWORD_SIGNUP_ENABLED=true` 时显示注册入口；默认关闭。注册明确发送 `register: true`，普通登录不会自动新建账号。已有账号和密码哈希保持原样，新增账号复用上游账号/城池/Agent token 创建事务。

注册限流为每 API 进程每 IP 每 10 分钟最多 5 次、全局最多 30 次，重启会重置；本 Compose 只有一个 API。多个副本或公开高流量环境需要另行设计共享限流。Nginx 覆盖转发的客户端地址，API 不向宿主机发布端口，避免直接伪造代理来源绕过限流。

入口默认 `http://NAS地址:8424`；同源 WebSocket 使用相同主机和端口。浏览器历史 `slg.wsUrl` 覆盖项在自托管同源模式不生效。外层反向代理后所有用户可能共享该代理的 IP 配额（更严格）；HTTPS 需在外层可信反向代理配置 WebSocket；OAuth 的 FRONTEND_URL 与回调地址应为实际访问地址。

## 验证边界

交付报告单独列出实际运行的源码测试、TypeScript 检查与前端构建结果。本云端没有 Docker/Podman、PostgreSQL 或 Nginx，不能把静态 YAML 检查称为 `docker compose config`、镜像构建、真实数据库并发测试或浏览器端到端测试。正式升级前仍须在隔离测试部署完成这些验证。
