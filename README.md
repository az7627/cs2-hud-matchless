# CS2 HUD Matchless — 实时 Ban & Pick 系统

[English](README_en-US.md)

CS2 比赛实时 Ban & Pick（地图 BP）HUD 系统。通过 Flask-SocketIO 提供实时多人在线 BP 流程，支持队长模式和队员投票模式，适配 BO1 / BO3 / BO5。

> 本项目使用 AI 辅助开发。

---

## 特性

- **实时多人 BP**：双方进入后实时投票 Ban/Pick 地图
- **两种模式**：队长模式（单人决策）和队员模式（团队投票）
- **多图投票**：队员模式下每轮可投多张图，Top-N 得票胜出，平票随机
- **BO1 / BO3 / BO5**：三种赛制，BO1 包含特殊选边流程
- **HTTPS 支持**：可选 SSL 证书配置
- **CLI 管理工具**：`bp_admin.py` 命令行管理密码、地图池、端口、SSL 等
- **管理员面板**：网页内 Admin 菜单进行设置、启停、重置
- **HUD 样式**：电竞风格 UI，含地图缩略图

---

## 截图

| 队员模式 | 地图投票 |
|---|---|
| *(请自行截图替换)* | *(请自行截图替换)* |

---

## 快速开始

### 环境要求

- Python 3.8+
- pip

### 安装

```bash
git clone https://github.com/yourname/cs2-hud-matchless.git
cd cs2-hud-matchless
pip install flask flask-socketio eventlet
```

### 启动

```bash
python bp_server.py
```

首次运行会自动创建 `bp_config.json`，默认密码打印在控制台。
用浏览器打开 `http://localhost:5000`。

### 修改密码和设置

```bash
python bp_admin.py
```

---

## 配置说明

所有配置存储在 `bp_config.json`（首次运行自动生成）。示例文件：`bp_config.example.json`。

| 字段 | 说明 |
|---|---|
| `admin.password_hash` / `salt` | 管理员密码（SHA-256 + salt） |
| `teams.team1/team2` | 队伍名称与密码 |
| `ssl.enable_https` | 是否启用 HTTPS |
| `ssl.cert_dir` | SSL 证书目录（支持相对路径） |
| `ssl.cert_file` / `ssl.key_file` | 证书文件名与私钥文件名 |
| `ssl.domain` | 域名（仅用于启动日志显示） |
| `http_port` / `https_port` | HTTP / HTTPS 端口 |
| `map_pool` | 可选地图列表 |
| `bo` | 赛制：1 / 3 / 5 |
| `entry_mode` | 模式：`captain`（队长）/ `team`（队员投票） |

---

## 地图图片

`res/` 目录下存放地图缩略图（PNG），文件名为地图 ID（如 `de_dust2.png`）。
当前包含：

- de_ancient / de_anubis / de_dust2 / de_inferno / de_mirage
- de_nuke / de_overpass / de_train / de_vertigo / de_cache

图片需自行替换为符合版权的素材。

---

## 安全提示

- **首次运行后务必修改密码**：默认密码为 `admin` / `team1` / `team2`，使用 `python bp_admin.py` 修改
- 服务器默认绑定 `0.0.0.0`，可被局域网内其他设备访问
- 启用 HTTPS 时需自行准备 SSL 证书（Let's Encrypt 等）
- `bp_config.json` 包含密码哈希，已加入 `.gitignore`

---

## 依赖库

### Python (pip)

| 库 | 用途 |
|---|---|
| [Flask](https://flask.palletsprojects.com/) | Web 框架 |
| [Flask-SocketIO](https://flask-socketio.readthedocs.io/) | WebSocket 实时通信 |
| [eventlet](https://eventlet.net/) | 异步网络引擎（HTTPS 需要） |

### 前端 CDN (无需安装)

| 库 | 用途 |
|---|---|
| [Socket.IO Client v4.7.5](https://socket.io/) | 客户端 WebSocket |
| [Font Awesome 6.5.1](https://fontawesome.com/) | 图标 |
| [Google Fonts](https://fonts.google.com/) | Inter / Rajdhani 字体 |

---

## 文件结构

```
cs2-hud-matchless/
├── bp_server.py              # 主服务器
├── bp_admin.py               # CLI 配置管理
├── bp_config.example.json    # 配置示例
├── bp_config.json            # 实际配置（gitignore）
├── RealtimeBP.html           # 主界面
├── BanPick.html              # BanPick 模式 HUD
├── BetweenMaps.html          # 地图间过渡
├── Halftime.html             # 半场
├── PreMatch.html             # 赛前
├── Results.html              # 结果
├── TechBreak.html            # 技术暂停
├── res/                      # 地图图片
├── README.md                 # 本文件
├── README_en-US.md           # 英文文档
└── LICENSE                   # MIT 许可证
```

---

## AI 辅助声明

本项目在开发过程中使用了 AI 编程助手（OpenCode + DeepSeek-V4 Pro）进行代码生成、重构和调试。所有 AI 生成的代码经过人工审阅和测试。

---

## 许可证

[MIT](LICENSE)
