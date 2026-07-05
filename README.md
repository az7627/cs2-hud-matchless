# CS2 HUD Matchless

适用于 CS2 比赛的 Broadcast HUD，专注覆盖**非比赛内**的所有展示场景——包括地图 BP、赛前等待、中场换边、地图间隙、技术暂停、赛后结果等。16:9 比例，1920×1080 及以上分辨率。

> **本项目部分代码由 AI 辅助编写。**

![Ban & Pick](readme_snapshot/ban&pick.png)

![Between Maps](readme_snapshot/between_maps.png)

## 功能模块

| 页面 | 说明 |
|------|------|
| **BanPick.html** | 地图 Ban/Pick 独立页。支持 BAN / PICK / SET CT 侧，按顺序播放动画流程。 |
| **PreMatch.html** | 赛前等待页。展示对阵双方、地图信息、Picked by，带自动倒计时（基于设定的开赛时间）。 |
| **Halftime.html** | 中场换边页。展示双方队伍名、比分、地图信息、Picked by，含倒计时器。 |
| **BetweenMaps.html** | 地图间隙页。展示上一张地图赛果、系列赛大分、Match History 表格、下一张地图、自动倒计时。 |
| **Results.html** | 赛后结算页。展示冠军、系列赛大比分、Map Breakdown 表格。 |
| **TechBreak.html** | 技术暂停页。展示暂停图标、原因说明、对阵双方和地图信息，含累计暂停计时器。 |
| **RealtimeBP.html** | 实时多人 Ban/Pick 页。通过 WebSocket 实现队长/团队投票模式，支持 BO1/BO3/BO5 的官方 BP 流程。 |
| **bp_server.py** | Flask-SocketIO 后端服务器，驱动 RealtimeBP 的实时 BP。支持 HTTPS、多地图池配置、密码认证。 |
| **bp_admin.py** | CLI 管理工具，用于配置密码、地图池、BO 赛制、入场模式等。 |

## 快速开始

### 静态页面

直接用浏览器打开任一 `.html` 文件即可。所有字段均为可编辑输入框，点击 **CONFIRM** 后会锁定为展示态。

### 实时 BP（RealtimeBP + bp_server）

```bash
# 安装依赖
pip install flask flask-socketio eventlet

# 配置密码和设置（首次运行会自动生成 bp_config.json）
python bp_admin.py

# 启动服务器
python bp_server.py
```

浏览器打开 `http://localhost:5000`，管理员、双方队长/队员分别进入后即可开始 BP。

## 配置说明（实时 BP 服务器）

### 默认密码

| 角色 | 密码 |
|------|------|
| Admin（管理员） | `admin` |
| Team 1 / Team 2 | `123456` |

### 修改配置

**方式一：CLI 工具**

```bash
python bp_admin.py
```

交互式菜单可修改管理员密码、双方队名及密码、地图池、BO 赛制、入场模式、HTTP/HTTPS 端口、SSL 证书等所有设置。

**方式二：网页端**

打开实时 BP 页面，点击左上角 **Admin** 按钮，输入管理员密码登录后可直接在浏览器中修改地图池、BO、入场模式、队名及密码。

### 配置项说明

| 配置项 | 说明 |
|--------|------|
| `admin.password_hash` / `salt` | 管理员密码的 SHA-256 哈希及盐值，通过 `bp_admin.py` 或网页 Admin 面板修改 |
| `teams.team1` / `teams.team2` | 双方队名、密码哈希及盐值 |
| `map_pool` | 地图池，格式为 `["de_dust2", "de_mirage", ...]`，需与 `res/` 目录下的图片文件名对应 |
| `bo` | 系列赛制，可选值 `1` / `3` / `5`，不同 BO 对应不同的官方 BP 流程 |
| `entry_mode` | 入场模式：`captain`（队长模式，每队仅 1 人）或 `team`（团队模式，多队员可加入并进行投票） |
| `http_port` | HTTP 服务器端口，默认 `5000` |
| `https_port` | HTTPS 服务器端口，默认 `8443` |
| `ssl.enable_https` | 是否启用 HTTPS，默认 `false` |
| `ssl.cert_dir` / `cert_file` / `key_file` | SSL 证书目录、证书文件名、私钥文件名 |
| `ssl.domain` | 仅在控制台启动信息中显示访问地址，**无实际功能** |

## 目录结构

```
├── BanPick.html         # 地图 BP 独立页面
├── PreMatch.html        # 赛前页面
├── Halftime.html        # 中场换边页面
├── BetweenMaps.html     # 地图间隙页面
├── Results.html         # 赛后结果页面
├── TechBreak.html       # 技术暂停页面
├── RealtimeBP.html      # 实时多人 BP 页面
├── bp_server.py         # 实时 BP 后端服务器
├── bp_admin.py          # BP 配置管理 CLI
├── bp_config.json       # BP 服务器配置（自动生成）
├── bp_config.example.json # 配置文件样例
├── css/                 # 独立样式文件
├── js/                  # 独立脚本文件
├── res/                 # 地图图片等静态资源
└── readme_snapshot/     # README 截图
```

## 设计特征

- 深色科幻风 UI，蓝橙双色区分 CT/T 阵营
- 响应式 16:9 布局，适配 1080p 及以上分辨率
- Rajdhani + Inter 字体组合
- 所有页面采用统一的 Design System（CSS 变量）
- 编辑-确认两步工作流：编辑态一键切为展示态

## 自定义

- **队名**：各页面的输入框均支持直接修改队名
- **地图名称、比分**：文本和数字输入框均可自由填写
- **BO 赛制**：可在 PreMatch/BetweenMaps/Results 中输入自定义系列赛格式
- **倒计时**：PreMatch 和 BetweenMaps 支持设置目标时间后自动计算剩余时间

## 版权说明

- 地图图片来源于 [Liquipedia](https://liquipedia.net/)
- 图标使用 [Font Awesome](https://fontawesome.com/) (v6.5.1)
- 本项目使用 AI 辅助开发
- 开源协议：[MIT License](LICENSE)
