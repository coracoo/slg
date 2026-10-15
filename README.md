# SLG · Selfhost 自托管版

SLG 是可由玩家或 AI Agent 游玩的三国策略游戏。本分支基于 [main](https://github.com/coracoo/slg/tree/main)，保留新版玩法，补充面向 NAS / 私有服务器的自托管支持。

游戏介绍、截图与玩法见 [main 中文说明](https://github.com/coracoo/slg/blob/main/README.zh-CN.md)；原项目：[athlan20/slg](https://github.com/athlan20/slg)。

## 本分支提供什么

- **本地账号注册**：`LOCAL_PASSWORD_SIGNUP_ENABLED=true` 时开放，默认关闭；普通登录不会自动创建账号。
- **保留原密码登录**：已有账号和密码哈希沿用原数据库，无需重置；Google / GitHub 登录配置也可继续使用。
- **同源 WebSocket**：网页与 WebSocket 共用访问域名和端口，适合 NAS 与反向代理部署。
- **两文件构建部署**：本地只需 `Dockerfile`、`compose.yaml` 和原来的 `.env`，构建时自动下载固定提交源码，无需手动下载源码包。

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
- 默认构建源码固定为 [`404c0bb6a681e49ff0b74ed3129996e2426d22d1`](https://github.com/coracoo/slg/commit/404c0bb6a681e49ff0b74ed3129996e2426d22d1)，可通过 `SLG_SOURCE_REF` 指定新的已验证完整 40 位提交 SHA。

HTTPS 请在外层可信反向代理配置，并启用 WebSocket 转发；使用 OAuth 时，将 `FRONTEND_URL` 和回调地址设为实际访问地址。

## 升级与数据安全

**已有存档请先阅读 [详细迁移指南](README.Selfhost.zh-CN.md)，不要直接覆盖自行修改过的 Compose。**

- 核对实际项目名、数据卷、端口、数据库凭据和环境变量，避免误连新卷或错误数据库。
- 升级前停止 API / Worker 写入，备份数据库，并保留原部署文件、`.env` 和旧镜像；建议先在隔离新卷恢复备份试运行。
- 升级前确认世界地块数为 **1,000,000**。数量异常时，新版初始化可能重建世界并清除领地 / 行军，应停止升级并调查。
- **不要执行 `docker compose down -v`，它会删除存档卷。** 数据库结构发生变化后，仅回滚镜像不保证兼容。

## 如何跟进上游

**目前没有自动合并上游或自动部署。** 上游更新后，需要先合并到 `selfhost`、处理冲突并验证，再将部署配置的 `SLG_SOURCE_REF` 更新为新的完整源码 SHA，重新执行构建和启动。

仅拉取新 README、重启容器或执行 `docker compose pull`，不会自动更新固定 SHA 构建的应用源码。不要把 `SLG_SOURCE_REF` 改成可变分支名。

## 验证范围与文档

当前自托管补丁已完成源码测试、TypeScript 检查及前端构建；**Docker 镜像构建与真实数据库升级尚未实测**，正式升级前仍需隔离验证。本次 README 更新不代表已完成部署验收。

- [详细部署、备份与迁移指南](README.Selfhost.zh-CN.md)
- [Agent API](docs/agent-api.md) · [MCP 配置](mcp/README.md)
- [后端配置](backend/README.md) · [前端说明](frontend/README.md)

## 许可证

沿用原项目的 [MIT License](LICENSE)。
