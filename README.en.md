# OpenWrt Console

[中文](./README.md) | English

A web management console for OpenWrt devices. The browser never connects to the device directly; instead a Next.js BFF (Route Handlers) talks to it over SSH (`ssh2`), aligning with LuCI's core management surface: status monitoring, network/wireless/firewall configuration, system administration, service management and a web terminal.

## Architecture

```
Browser (React pages)
   │  fetch /api/*
   ▼
Next.js Route Handlers (BFF, 40 route files)
   │  device service layer
   ▼
src/lib/openwrt/* (19 service modules: ubus / UCI / command parsing)
   │  exec / execJson
   ▼
src/lib/ssh/client.ts (ssh2 single pooled connection, reconnect on timeout)
   ▼
OpenWrt device (SSH: shell / ubus / uci)
```

- **Config-driven**: configuration pages read/write `/etc/config/*` through UCI primitives (`src/lib/openwrt/uci.ts` provides show/get/set/delete/commit) merged with live runtime state, so devices without the matching hardware (e.g. a radio-less box) can still display and edit configuration.
- **Session auth**: the login page validates device SSH credentials and issues a session cookie (`jose`); all BFF routes enforce it.
- **Polling**: React Query manages queries and caches; intervals are per-page and polling backs off automatically on request failure.

## Feature coverage (21 pages)

| Group | Pages |
| --- | --- |
| Status | Dashboard, Processes, Realtime Graphs |
| Network | Interfaces, Wireless, DHCP & Leases, Firewall, Routes, Switch, Diagnostics |
| System | System, Mounts, Crontab, LEDs, Backup / Firmware, Startup, Packages, System Log, Terminal |
| Services | Dynamic DNS, UPnP |

- **Web terminal**: line-based SSH command runner on xterm.js (history, Ctrl-C/L, example commands).
- **Realtime graphs**: CPU / load / memory / interface traffic (recharts).
- **i18n**: next-intl, Simplified Chinese / English (`src/i18n/messages`).
- **Theming**: light/dark via next-themes; shadcn/ui (Radix) components with Tailwind CSS v4.

## Directory structure

```
src/
├── app/
│   ├── (app)/          # 21 admin pages (grouped directories)
│   ├── api/            # 40 BFF route files (auth/network/system/services/...)
│   └── login/          # login page
├── components/         # UI components (topbar/sidebar/terminal/charts/...)
├── hooks/              # React Query hooks (use-openwrt)
├── i18n/               # next-intl config and messages (zh/en)
└── lib/
    ├── openwrt/        # device service layer (19 modules: network/wireless/firewall/uci/...)
    ├── ssh/            # ssh2 connection pool
    └── api/            # frontend fetch wrapper
```

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) · React Query · next-intl · next-themes · recharts · xterm.js · ssh2 · zod · jose

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in with the device's SSH address and credentials (the device must have SSH enabled, e.g. `192.168.3.5:22`).

```bash
npm run build   # production build
npm run start   # production server
npm run lint    # lint
```

## Goals & roadmap

Feature scope aligns with the OpenWrt LuCI core management surface (third-party luci-app plugins are out of scope). Wireless, switch/VLAN and DNS modules are implemented UCI-config-driven so they remain usable on hardware-less devices; field-level parity with LuCI continues (wireless scan/join, VLAN port matrix, dnsmasq host records, etc.).

## License

This project is licensed under the [MIT License](./LICENSE).
