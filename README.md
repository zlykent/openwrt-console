# OpenWrt Console（OpenWrt Web 控制台）

[English](./README.en.md) | 中文

面向 OpenWrt 设备的 Web 管理控制台。浏览器不直连设备，而是经由 Next.js BFF（Route Handlers）通过 SSH（`ssh2`）与设备通信，对齐 LuCI 的核心管理面：状态监控、网络/无线/防火墙配置、系统管理、服务管理与 Web 终端。

## 架构

```
浏览器 (React SPA 页面)
   │  fetch /api/*
   ▼
Next.js Route Handlers (BFF, 40 个路由文件)
   │  调用设备服务层
   ▼
src/lib/openwrt/* (19 个服务模块: ubus / UCI / 命令解析)
   │  exec / execJson
   ▼
src/lib/ssh/client.ts (ssh2 单连接池, 超时重连)
   ▼
OpenWrt 设备 (SSH: shell / ubus / uci)
```

- **配置驱动**：配置类页面基于 UCI（`src/lib/openwrt/uci.ts` 提供 show/get/set/delete/commit 原语）读写 `/etc/config/*`，并合并运行时状态；无对应硬件的设备（如无射频的盒子）也能展示与编辑配置。
- **会话认证**：登录页校验设备 SSH 凭据，签发会话 Cookie（`jose`），BFF 各路由统一鉴权。
- **数据轮询**：React Query 管理查询与缓存，轮询间隔按页面配置，请求失败自动退避停止轮询。

## 功能覆盖（21 个页面）

| 分组 | 页面 |
| --- | --- |
| 总览 | 仪表盘、进程、实时图表 |
| 网络 | 网络接口、无线网络、DHCP 与客户机、防火墙、路由、交换机、网络诊断 |
| 系统 | 系统、挂载点、计划任务、LED 配置、备份/固件升级、启动项、软件包、系统日志、终端 |
| 服务 | 动态 DNS、UPnP |

- **Web 终端**：xterm.js 行式 SSH 命令执行器（含历史、Ctrl-C/L、示例命令）。
- **实时图表**：CPU / 负载 / 内存 / 接口流量（recharts）。
- **国际化**：next-intl，简体中文 / English（`src/i18n/messages`）。
- **主题**：next-themes 明暗切换；shadcn/ui（Radix）组件 + Tailwind CSS v4。

## 目录结构

```
src/
├── app/
│   ├── (app)/          # 21 个管理页面（按分组目录）
│   ├── api/            # 40 个 BFF 路由文件（auth/network/system/services/...）
│   └── login/          # 登录页
├── components/         # UI 组件（topbar/sidebar/terminal/图表等）
├── hooks/              # React Query hooks（use-openwrt）
├── i18n/               # next-intl 配置与 messages（zh/en）
└── lib/
    ├── openwrt/        # 设备服务层（19 模块：network/wireless/firewall/uci/...）
    ├── ssh/            # ssh2 连接池
    └── api/            # 前端 fetch 封装
```

## 技术栈

Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui（Radix）· React Query · next-intl · next-themes · recharts · xterm.js · ssh2 · zod · jose

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:3000 ，使用设备的 SSH 地址与账号密码登录（设备需开启 SSH 服务，如 `192.168.3.5:22`）。

```bash
npm run build   # 生产构建
npm run start   # 生产启动
npm run lint    # 代码检查
```

## 目标与路线

功能范围对齐 OpenWrt LuCI 核心管理面（第三方 luci-app 插件不在范围内）。无线、交换机/VLAN、DNS 等模块按 UCI 配置驱动方式实现，保证在硬件缺失的真机上同样可用；后续持续补齐与 LuCI 的字段级对齐（无线扫描/加入、VLAN 端口矩阵、dnsmasq 主机记录等）。

## 许可证

本项目采用 [MIT 许可证](./LICENSE)。
