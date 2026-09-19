"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apiFetch } from "@/lib/api/http";
import { useBoard } from "@/hooks/use-openwrt";

type TermResult = { stdout: string; stderr: string; code: number };

const FONT = "ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace";

const DARK = {
  background: "#0c0c0e",
  foreground: "#e4e4e7",
  cursor: "#e4e4e7",
  selectionBackground: "#3f3f46",
  black: "#18181b", red: "#f87171", green: "#4ade80", yellow: "#facc15",
  blue: "#60a5fa", magenta: "#c084fc", cyan: "#22d3ee", white: "#e4e4e7",
  brightBlack: "#52525b", brightRed: "#fca5a5", brightGreen: "#86efac",
  brightYellow: "#fde047", brightBlue: "#93c5fd", brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9", brightWhite: "#fafafa",
};

const LIGHT = {
  background: "#ffffff",
  foreground: "#18181b",
  cursor: "#18181b",
  selectionBackground: "#d4d4d8",
  black: "#18181b", red: "#dc2626", green: "#16a34a", yellow: "#ca8a04",
  blue: "#2563eb", magenta: "#9333ea", cyan: "#0891b2", white: "#f4f4f5",
  brightBlack: "#52525b", brightRed: "#ef4444", brightGreen: "#22c55e",
  brightYellow: "#eab308", brightBlue: "#3b82f6", brightMagenta: "#a855f7",
  brightCyan: "#06b6d4", brightWhite: "#fafafa",
};

const nl = (s: string) => s.replace(/\r?\n/g, "\r\n");

export type TerminalCommand = { cmd: string; n: number };

/**
 * Line-based SSH terminal rendered with xterm.js.
 *
 * Each submitted line is executed by the BFF (`POST /api/terminal`) over the
 * pooled SSH connection and its output is written back to the terminal. Local
 * line editing (echo, backspace, history, Ctrl-C/Ctrl-L) is handled here; this
 * is a command runner rather than an interactive PTY, so full-screen programs
 * like `top` are not supported.
 */
export function DeviceTerminal({
  command,
  clearToken = 0,
}: {
  command?: TerminalCommand | null;
  clearToken?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const runRef = useRef<((cmd: string) => void) | null>(null);
  const hostRef = useRef("openwrt");
  const { resolvedTheme } = useTheme();
  const { data: board } = useBoard();
  const t = useTranslations("terminal");

  useEffect(() => {
    if (board?.hostname) hostRef.current = board.hostname;
  }, [board]);

  // Mount xterm once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: FONT,
      theme: DARK,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      fit.fit();
    } catch {
      /* container may have zero size on first paint */
    }
    termRef.current = term;

    let buffer = "";
    const history: string[] = [];
    let hIndex = 0;
    let busy = false;

    const writePrompt = () =>
      term.write(`\x1b[32mroot@${hostRef.current}\x1b[0m:\x1b[34m~\x1b[0m# `);

    const redraw = () => {
      buffer = hIndex >= history.length ? "" : history[hIndex];
      term.write("\r\x1b[K");
      writePrompt();
      term.write(buffer);
    };

    const execute = async (cmd: string) => {
      term.write("\r\n");
      const trimmed = cmd.trim();
      if (!trimmed) {
        writePrompt();
        return;
      }
      if (history[history.length - 1] !== cmd) history.push(cmd);
      hIndex = history.length;
      busy = true;
      try {
        const r = await apiFetch<TermResult>("/api/terminal", {
          method: "POST",
          body: JSON.stringify({ command: cmd }),
        });
        if (r.stdout) term.write(nl(r.stdout));
        if (r.stderr) term.write(`\x1b[31m${nl(r.stderr)}\x1b[0m`);
        term.write(`\r\n\x1b[90m[${t("exitCode")} ${r.code}]\x1b[0m\r\n`);
      } catch (e) {
        term.write(`\r\n\x1b[31m${(e as Error).message}\x1b[0m\r\n`);
      } finally {
        busy = false;
        writePrompt();
      }
    };

    term.onData((data) => {
      if (busy) return;
      if (data === "\r") {
        const cmd = buffer;
        buffer = "";
        void execute(cmd);
        return;
      }
      if (data === "\x7f") {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }
      if (data === "\x03") {
        term.write("^C\r\n");
        buffer = "";
        writePrompt();
        return;
      }
      if (data === "\x0c") {
        term.write("\x1b[2J\x1b[H");
        writePrompt();
        term.write(buffer);
        return;
      }
      if (data === "\x1b[A") {
        if (history.length === 0) return;
        hIndex = Math.max(0, hIndex - 1);
        redraw();
        return;
      }
      if (data === "\x1b[B") {
        hIndex = Math.min(history.length, hIndex + 1);
        redraw();
        return;
      }
      if (data.charCodeAt(0) < 32) return; // ignore other control / escape sequences
      buffer += data;
      term.write(data);
    });

    term.writeln(`\x1b[1m${t("welcome")}\x1b[0m`);
    term.writeln(`\x1b[90m${t("hint")}\x1b[0m\r\n`);
    writePrompt();
    term.focus();

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(container);
    const onClick = () => term.focus();
    container.addEventListener("click", onClick);

    runRef.current = (cmd: string) => {
      if (busy) return;
      term.write("\r\x1b[K");
      writePrompt();
      term.write(cmd);
      buffer = "";
      void execute(cmd);
    };

    return () => {
      ro.disconnect();
      container.removeEventListener("click", onClick);
      term.dispose();
      termRef.current = null;
      runRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep colours in sync with the app theme.
  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = resolvedTheme === "light" ? LIGHT : DARK;
  }, [resolvedTheme]);

  // Run an externally supplied command (example chips).
  useEffect(() => {
    if (command) runRef.current?.(command.cmd);
  }, [command]);

  // Clear on request.
  useEffect(() => {
    if (clearToken > 0) termRef.current?.clear();
  }, [clearToken]);

  return (
    <div className="border-input relative min-h-64 w-full flex-1 overflow-hidden rounded-lg border p-2">
      {/* Absolute host so xterm's pixel height never feeds back into the flex
          layout (which would otherwise grow the page without bound). */}
      <div ref={containerRef} className="absolute inset-2" />
    </div>
  );
}
