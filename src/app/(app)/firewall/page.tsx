"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useCreateFirewallObject,
  useDeleteFirewallSection,
  useFirewall,
  useFirewallCustom,
  useIfaceConfig,
  useSaveFirewallCustom,
  useToggleFirewallSection,
  useUpdateFirewallDefaults,
  useUpdateFirewallObject,
} from "@/hooks/use-openwrt";
import type { FirewallDefaults, FirewallRedirect, FirewallRule, FirewallZone } from "@/lib/openwrt/types";
import type { RedirectInput, RuleInput, ZoneInput } from "@/lib/openwrt/firewall";

type Policy = "ACCEPT" | "REJECT" | "DROP";

/** LuCI's `and(uciname,maxlength(11))` for zone names. */
const ZONE_NAME_RE = /^[A-Za-z0-9_]{1,11}$/;

/** Protocol suggestions, as offered by rule-details.lua / forward-details.lua. */
const PROTOS = ["all", "tcp udp", "tcp", "udp", "icmp"];

/** The icmp_type list of rule-details.lua, offered as datalist suggestions. */
const ICMP_TYPES = [
  "echo-reply",
  "destination-unreachable",
  "network-unreachable",
  "host-unreachable",
  "protocol-unreachable",
  "port-unreachable",
  "fragmentation-needed",
  "source-route-failed",
  "network-unknown",
  "host-unknown",
  "network-prohibited",
  "host-prohibited",
  "TOS-network-unreachable",
  "TOS-host-unreachable",
  "communication-prohibited",
  "host-precedence-violation",
  "precedence-cutoff",
  "source-quench",
  "redirect",
  "network-redirect",
  "host-redirect",
  "TOS-network-redirect",
  "TOS-host-redirect",
  "echo-request",
  "router-advertisement",
  "router-solicitation",
  "time-exceeded",
  "ttl-zero-during-transit",
  "ttl-zero-during-reassembly",
  "parameter-problem",
  "ip-header-bad",
  "required-option-missing",
  "timestamp-request",
  "timestamp-reply",
  "address-mask-request",
  "address-mask-reply",
  "packet-too-big",
  "bad-header",
  "unknown-header-type",
  "neighbour-solicitation",
  "neighbour-advertisement",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** fw3's built-in defaults, used to seed a new zone before the query resolves. */
const FALLBACK_DEFAULTS: FirewallDefaults = {
  input: "REJECT",
  output: "ACCEPT",
  forward: "REJECT",
  synFlood: false,
  dropInvalid: false,
  fullcone: false,
  flowOffloading: false,
};

function policyLabel(t: (k: string) => string, k: string) {
  return k === "ACCEPT" ? t("accept") : k === "DROP" ? t("drop") : t("reject");
}

/**
 * How LuCI renders the two ends of a rule: an absent or `*` source means "any
 * zone", while an absent destination means the router itself and `*` means any
 * zone the packet may be forwarded to.
 */
function srcZoneText(t: (k: string) => string, v?: string) {
  return !v || v === "*" ? t("anyZone") : v;
}

function destZoneText(t: (k: string) => string, v?: string) {
  if (v === "*") return t("anyZone");
  return v ? v : t("deviceZone");
}

function FormField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-[0.7rem]">{hint}</p> : null}
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

/**
 * Text input with datalist suggestions — LuCI's `Value` plus `o:value(...)`:
 * the suggestions are a convenience and the field still accepts anything, which
 * matters because real configs carry protocols (`igmp`, `esp`) and icmp types
 * that no fixed list covers.
 */
function SuggestInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: readonly string[];
  placeholder?: string;
}) {
  return (
    <>
      <Input
        id={id}
        value={value}
        list={`${id}-suggestions`}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={`${id}-suggestions`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

function PolicySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("firewall");
  const policies: Policy[] = ["ACCEPT", "REJECT", "DROP"];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {policies.map((p) => (
          <SelectItem key={p} value={p}>
            {policyLabel(t, p)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Rule action: the three policies plus `NOTRACK` from rule-details.lua. */
function TargetSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("firewall");
  const targets = ["ACCEPT", "REJECT", "DROP", "NOTRACK"];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {targets.map((v) => (
          <SelectItem key={v} value={v}>
            {v === "NOTRACK" ? t("notrack") : policyLabel(t, v)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Zone picker mirroring `cbi/firewall_zonelist.htm`. `allowAny` adds the `*`
 * entry, `allowDevice` adds the empty entry (the router itself) and `allowUnset`
 * adds a neutral empty entry for options where LuCI offers neither.
 */
function ZoneSelect({
  zones,
  value,
  onChange,
  allowAny,
  allowDevice,
  allowUnset,
}: {
  zones: string[];
  /** An unset option reads as "no zone selected", which is what LuCI shows too. */
  value: string | undefined;
  onChange: (v: string) => void;
  allowAny?: boolean;
  allowDevice?: boolean;
  allowUnset?: boolean;
}) {
  const t = useTranslations("firewall");
  const current = value ?? "";
  const items: { value: string; label: string; out: string }[] = [];
  if (allowDevice) items.push({ value: "__device", label: t("deviceZone"), out: "" });
  if (allowUnset) items.push({ value: "__unset", label: "—", out: "" });
  if (allowAny) items.push({ value: "*", label: t("anyZone"), out: "*" });
  for (const z of zones) items.push({ value: z, label: z, out: z });
  const selected = items.find((i) => i.out === current)?.value ?? current;
  return (
    <Select value={selected} onValueChange={(v) => onChange(items.find((i) => i.value === v)?.out ?? v)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** `weekdays` MultiValue: seven toggles stored as a space separated list. */
function WeekdayPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("firewall");
  const picked = new Set(value.split(/\s+/).filter(Boolean));
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((d) => {
        const on = picked.has(d);
        return (
          <Button
            key={d}
            type="button"
            size="sm"
            variant={on ? "default" : "outline"}
            aria-pressed={on}
            className="h-7 px-2 text-xs font-normal"
            onClick={() => {
              const next = new Set(picked);
              if (on) next.delete(d);
              else next.add(d);
              // Always store LuCI's Sun..Sat order, whatever was clicked first.
              onChange(WEEKDAYS.filter((x) => next.has(x)).join(" "));
            }}
          >
            {t(`weekday${d}`)}
          </Button>
        );
      })}
    </div>
  );
}

function OptionSelect({
  value,
  onChange,
  options,
  noneLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  noneLabel: string;
}) {
  return (
    <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">{noneLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useSaveObject(onDone: () => void) {
  const t = useTranslations("firewall");
  const create = useCreateFirewallObject();
  const update = useUpdateFirewallObject();
  function submit(body: Parameters<typeof create.mutate>[0], isUpdate: boolean) {
    const m = isUpdate ? update : create;
    m.mutate(body, {
      onSuccess: (res) => {
        // A reload briefly drops every connection on the device, so only claim
        // one when the writer actually had something to commit.
        toast.success(res.reloaded ? t("savedObject") : t("unchanged"));
        onDone();
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }
  return { submit, pending: create.isPending || update.isPending };
}

function ZoneDialog({
  initial,
  networks,
  defaults,
  onOpenChange,
}: {
  initial?: FirewallZone;
  networks: string[];
  defaults: FirewallDefaults;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("firewall");
  const tc = useTranslations("common");
  const [form, setForm] = useState<ZoneInput>(() =>
    initial
      ? {
          ref: initial.ref,
          name: initial.name,
          networks: initial.networks,
          input: initial.input,
          output: initial.output,
          forward: initial.forward,
          masq: initial.masq,
          mtuFix: initial.mtuFix,
          family: initial.family ?? "",
          masqSrc: initial.masqSrc ?? "",
          masqDest: initial.masqDest ?? "",
          conntrack: initial.conntrack,
          log: initial.log,
          logLimit: initial.logLimit ?? "",
        }
      : {
          // LuCI's `add_zone` seeds the three policies from the global defaults.
          name: "",
          networks: [],
          input: defaults.input,
          output: defaults.output,
          forward: defaults.forward,
          masq: false,
          mtuFix: false,
          family: "",
          masqSrc: "",
          masqDest: "",
          conntrack: false,
          log: false,
          logLimit: "",
        },
  );
  const { submit, pending } = useSaveObject(() => onOpenChange(false));
  const set = <K extends keyof ZoneInput>(key: K, value: ZoneInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const nameError = form.name !== "" && !ZONE_NAME_RE.test(form.name);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t("editZone") : t("addZone")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FormField
            label={t("zoneName")}
            hint={initial ? t("zoneRenameHint") : undefined}
          >
            <Input value={form.name} onChange={(e) => set("name", e.target.value.trim())} />
            {nameError ? (
              <p className="text-destructive text-xs">{t("zoneNameInvalid")}</p>
            ) : null}
          </FormField>
          <FormField label={t("networks")}>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
              {networks.map((n) => (
                <label key={n} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.networks.includes(n)}
                    onCheckedChange={(v) =>
                      set(
                        "networks",
                        v ? [...form.networks, n] : form.networks.filter((x) => x !== n),
                      )
                    }
                  />
                  {n}
                </label>
              ))}
            </div>
          </FormField>
          <div className="grid grid-cols-3 gap-2">
            <FormField label={t("input")}>
              <PolicySelect value={form.input} onChange={(v) => set("input", v)} />
            </FormField>
            <FormField label={t("output")}>
              <PolicySelect value={form.output} onChange={(v) => set("output", v)} />
            </FormField>
            <FormField label={t("forward")}>
              <PolicySelect value={form.forward} onChange={(v) => set("forward", v)} />
            </FormField>
          </div>
          <div className="flex items-center gap-6 rounded-lg border px-3 py-2">
            <SwitchRow label={t("masquerading")} checked={form.masq} onChange={(v) => set("masq", v)} />
            <SwitchRow label={t("mssClamping")} checked={form.mtuFix} onChange={(v) => set("mtuFix", v)} />
          </div>

          <p className="text-muted-foreground border-t pt-3 text-xs font-medium">{t("advanced")}</p>
          <FormField label={t("restrictFamily")}>
            <OptionSelect
              value={form.family ?? ""}
              onChange={(v) => set("family", v)}
              options={["ipv4", "ipv6"]}
              noneLabel={t("familyAny")}
            />
          </FormField>
          {/* LuCI only offers the masq restrictions for IPv4. */}
          {form.family !== "ipv6" ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("masqSrc")} hint="0.0.0.0/0">
                <Input value={form.masqSrc ?? ""} onChange={(e) => set("masqSrc", e.target.value)} />
              </FormField>
              <FormField label={t("masqDest")} hint="0.0.0.0/0">
                <Input value={form.masqDest ?? ""} onChange={(e) => set("masqDest", e.target.value)} />
              </FormField>
            </div>
          ) : null}
          <div className="flex items-center gap-6 rounded-lg border px-3 py-2">
            <SwitchRow
              label={t("conntrack")}
              checked={form.conntrack}
              onChange={(v) => set("conntrack", v)}
            />
            <SwitchRow label={t("zoneLog")} checked={form.log} onChange={(v) => set("log", v)} />
          </div>
          {form.log ? (
            <FormField label={t("logLimit")} hint="10/minute">
              <Input value={form.logLimit ?? ""} onChange={(e) => set("logLimit", e.target.value)} />
            </FormField>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => submit({ kind: "zone", zone: form }, Boolean(initial))}
            disabled={pending || !ZONE_NAME_RE.test(form.name)}
          >
            {pending ? tc("applying") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({
  initial,
  zones,
  onOpenChange,
}: {
  initial?: FirewallRule;
  zones: string[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("firewall");
  const tc = useTranslations("common");
  const [form, setForm] = useState<RuleInput>(() =>
    initial
      ? {
          ref: initial.ref,
          name: initial.name ?? "",
          family: initial.family ?? "",
          proto: initial.proto ?? "",
          icmpType: initial.icmpType ?? "",
          src: initial.src ?? "",
          srcMac: initial.srcMac ?? "",
          srcIp: initial.srcIp ?? "",
          srcPort: initial.srcPort ?? "",
          dest: initial.dest ?? "",
          destIp: initial.destIp ?? "",
          destPort: initial.destPort ?? "",
          target: initial.target,
          extra: initial.extra ?? "",
          weekdays: initial.weekdays ?? "",
          monthdays: initial.monthdays ?? "",
          startTime: initial.startTime ?? "",
          stopTime: initial.stopTime ?? "",
          startDate: initial.startDate ?? "",
          stopDate: initial.stopDate ?? "",
          utcTime: initial.utcTime,
          enabled: initial.enabled,
        }
      : {
          // rules.lua's quick-add seeds target ACCEPT with source zone wan.
          name: "",
          family: "",
          proto: "",
          icmpType: "",
          src: "wan",
          srcMac: "",
          srcIp: "",
          srcPort: "",
          dest: "",
          destIp: "",
          destPort: "",
          target: "ACCEPT",
          extra: "",
          weekdays: "",
          monthdays: "",
          startTime: "",
          stopTime: "",
          startDate: "",
          stopDate: "",
          utcTime: false,
          enabled: true,
        },
  );
  const { submit, pending } = useSaveObject(() => onOpenChange(false));
  const set = <K extends keyof RuleInput>(key: K, value: RuleInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t("editRule") : t("addRule")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label={tc("name")}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("srcZone")}>
              <ZoneSelect zones={zones} value={form.src} onChange={(v) => set("src", v)} allowAny allowUnset />
            </FormField>
            <FormField label={t("destZone")}>
              <ZoneSelect
                zones={zones}
                value={form.dest}
                onChange={(v) => set("dest", v)}
                allowAny
                allowDevice
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("family")}>
              <OptionSelect
                value={form.family ?? ""}
                onChange={(v) => set("family", v)}
                options={["ipv4", "ipv6"]}
                noneLabel={t("familyAny")}
              />
            </FormField>
            <FormField label={t("protocol")}>
              <SuggestInput
                id="rule-proto"
                value={form.proto ?? ""}
                onChange={(v) => set("proto", v)}
                suggestions={PROTOS}
              />
            </FormField>
          </div>
          <FormField label={t("icmpType")} hint={t("listHint")}>
            <SuggestInput
              id="rule-icmp-type"
              value={form.icmpType ?? ""}
              onChange={(v) => set("icmpType", v)}
              suggestions={ICMP_TYPES}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("srcMac")}>
              <Input
                value={form.srcMac ?? ""}
                placeholder="aa:bb:cc:dd:ee:ff"
                onChange={(e) => set("srcMac", e.target.value)}
              />
            </FormField>
            <FormField label={t("srcIp")}>
              <Input
                value={form.srcIp ?? ""}
                placeholder="192.168.1.0/24"
                onChange={(e) => set("srcIp", e.target.value)}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("srcPort")} hint={t("portHint")}>
              <Input value={form.srcPort ?? ""} onChange={(e) => set("srcPort", e.target.value)} />
            </FormField>
            <FormField label={t("destIp")}>
              <Input
                value={form.destIp ?? ""}
                placeholder="192.168.1.0/24"
                onChange={(e) => set("destIp", e.target.value)}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("destPort")} hint={t("portHint")}>
              <Input
                value={form.destPort ?? ""}
                placeholder="8000-8100"
                onChange={(e) => set("destPort", e.target.value)}
              />
            </FormField>
            <FormField label={t("target")}>
              <TargetSelect value={form.target} onChange={(v) => set("target", v)} />
            </FormField>
          </div>
          <FormField label={t("extra")} hint={t("extraHint")}>
            <Input value={form.extra ?? ""} onChange={(e) => set("extra", e.target.value)} />
          </FormField>

          <p className="text-muted-foreground border-t pt-3 text-xs font-medium">
            {t("timeRestrictions")}
          </p>
          <FormField label={t("weekdays")}>
            <WeekdayPicker value={form.weekdays ?? ""} onChange={(v) => set("weekdays", v)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("monthdays")} hint={t("monthdaysHint")}>
              <Input value={form.monthdays ?? ""} onChange={(e) => set("monthdays", e.target.value)} />
            </FormField>
            <div className="flex items-end pb-1">
              <SwitchRow
                label={t("utcTime")}
                checked={form.utcTime}
                onChange={(v) => set("utcTime", v)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("startTime")}>
              <Input
                value={form.startTime ?? ""}
                placeholder="00:00:00"
                onChange={(e) => set("startTime", e.target.value)}
              />
            </FormField>
            <FormField label={t("stopTime")}>
              <Input
                value={form.stopTime ?? ""}
                placeholder="23:59:59"
                onChange={(e) => set("stopTime", e.target.value)}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("startDate")}>
              <Input
                value={form.startDate ?? ""}
                placeholder="2026-01-01"
                onChange={(e) => set("startDate", e.target.value)}
              />
            </FormField>
            <FormField label={t("stopDate")}>
              <Input
                value={form.stopDate ?? ""}
                placeholder="2026-12-31"
                onChange={(e) => set("stopDate", e.target.value)}
              />
            </FormField>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <SwitchRow label={tc("enabled")} checked={form.enabled} onChange={(v) => set("enabled", v)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => submit({ kind: "rule", rule: form }, Boolean(initial))} disabled={pending}>
            {pending ? tc("applying") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Port forward (`target DNAT`, forward-details.lua) and source NAT
 * (`target SNAT`, the SNAT branch of rule-details.lua) are the same uci section
 * type with largely the same fields, so one dialog renders both; only the
 * meaning of `src_dip`/`src_dport` and the NAT loopback flag differ.
 */
function RedirectDialog({
  initial,
  zones,
  target,
  onOpenChange,
}: {
  initial?: FirewallRedirect;
  zones: string[];
  target: "DNAT" | "SNAT";
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("firewall");
  const tc = useTranslations("common");
  const dnat = target === "DNAT";
  const [form, setForm] = useState<RedirectInput>(() =>
    initial
      ? {
          ref: initial.ref,
          name: initial.name ?? "",
          target: initial.target,
          proto: initial.proto ?? "",
          src: initial.src ?? "",
          srcMac: initial.srcMac ?? "",
          srcIp: initial.srcIp ?? "",
          srcPort: initial.srcPort ?? "",
          srcDip: initial.srcDip ?? "",
          srcDport: initial.srcDport ?? "",
          dest: initial.dest ?? "",
          destIp: initial.destIp ?? "",
          destPort: initial.destPort ?? "",
          reflection: initial.reflection,
          extra: initial.extra ?? "",
          enabled: initial.enabled,
        }
      : {
          name: "",
          target,
          // LuCI seeds a new entry with source zone wan and internal zone lan.
          proto: dnat ? "tcp udp" : "all",
          src: zones.includes("wan") ? "wan" : (zones[0] ?? ""),
          srcMac: "",
          srcIp: "",
          srcPort: "",
          srcDip: "",
          srcDport: "",
          dest: zones.includes("lan") ? "lan" : (zones[0] ?? ""),
          destIp: "",
          destPort: "",
          reflection: true,
          extra: "",
          enabled: true,
        },
  );
  const { submit, pending } = useSaveObject(() => onOpenChange(false));
  const set = <K extends keyof RedirectInput>(key: K, value: RedirectInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  // fw3 drops a redirect that is missing one of these, so refuse it up front.
  const complete = dnat
    ? Boolean(form.src && form.dest && form.srcDport && form.destIp)
    : Boolean(form.src && form.dest && form.srcDip);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial
              ? dnat
                ? t("editRedirect")
                : t("editSnat")
              : dnat
                ? t("addRedirect")
                : t("addSnat")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label={tc("name")}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("srcZone")}>
              <ZoneSelect zones={zones} value={form.src} onChange={(v) => set("src", v)} />
            </FormField>
            <FormField label={dnat ? t("internalZone") : t("destZone")}>
              <ZoneSelect zones={zones} value={form.dest} onChange={(v) => set("dest", v)} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("protocol")}>
              <SuggestInput
                id="redirect-proto"
                value={form.proto ?? ""}
                onChange={(v) => set("proto", v)}
                suggestions={PROTOS}
              />
            </FormField>
            <FormField label={dnat ? t("externalPort") : t("snatPort")} hint={t("portHint")}>
              <Input
                value={form.srcDport ?? ""}
                placeholder={dnat ? "8080" : ""}
                onChange={(e) => set("srcDport", e.target.value)}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={dnat ? t("externalIp") : t("snatIp")}>
              <Input
                value={form.srcDip ?? ""}
                placeholder="203.0.113.5"
                onChange={(e) => set("srcDip", e.target.value)}
              />
            </FormField>
            <FormField label={dnat ? t("internalIp") : t("destIp")}>
              <Input
                value={form.destIp ?? ""}
                placeholder="192.168.1.20"
                onChange={(e) => set("destIp", e.target.value)}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={dnat ? t("internalPort") : t("destPort")} hint={t("portHint")}>
              <Input
                value={form.destPort ?? ""}
                placeholder="80"
                onChange={(e) => set("destPort", e.target.value)}
              />
            </FormField>
            <FormField label={t("srcPort")} hint={t("portHint")}>
              <Input value={form.srcPort ?? ""} onChange={(e) => set("srcPort", e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("srcIp")}>
              <Input value={form.srcIp ?? ""} onChange={(e) => set("srcIp", e.target.value)} />
            </FormField>
            {/* A redirect's src_mac is a DynamicList in forward-details.lua. */}
            <FormField label={t("srcMac")}>
              <Input
                value={form.srcMac ?? ""}
                placeholder="aa:bb:cc:dd:ee:ff"
                onChange={(e) => set("srcMac", e.target.value)}
              />
            </FormField>
          </div>
          <FormField label={t("extra")} hint={t("extraHint")}>
            <Input value={form.extra ?? ""} onChange={(e) => set("extra", e.target.value)} />
          </FormField>
          <div className="flex flex-wrap items-center gap-6 rounded-lg border px-3 py-2">
            {dnat ? (
              <SwitchRow
                label={t("natLoopback")}
                checked={form.reflection}
                onChange={(v) => set("reflection", v)}
              />
            ) : null}
            <SwitchRow label={tc("enabled")} checked={form.enabled} onChange={(v) => set("enabled", v)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => submit({ kind: "redirect", redirect: form }, Boolean(initial))}
            disabled={pending || !complete}
          >
            {pending ? tc("applying") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One of LuCI's two redirect tables — port forwards (`target DNAT`,
 * forwards.lua) and source NAT (`target SNAT`, the SNAT branch of rules.lua).
 * The rows are the same uci section type, so only the column headings and the
 * dialog labels change.
 */
function RedirectCard({
  target,
  rows,
  togglePending,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  target: "DNAT" | "SNAT";
  rows: FirewallRedirect[];
  togglePending: boolean;
  onAdd: () => void;
  onEdit: (r: FirewallRedirect) => void;
  onToggle: (ref: string | undefined, enabled: boolean) => void;
  onDelete: (ref: string | undefined) => void;
}) {
  const t = useTranslations("firewall");
  const tc = useTranslations("common");
  const dnat = target === "DNAT";
  return (
    <Card className="min-h-0 flex-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {dnat ? t("tabRedirects") : t("snat")}
          <Badge variant="secondary" className="tabular-nums">
            {rows.length}
          </Badge>
          <Button variant="outline" size="sm" className="ml-auto" onClick={onAdd}>
            <PlusIcon className="size-3.5" />
            {dnat ? t("addRedirect") : t("addSnat")}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc("name")}</TableHead>
                <TableHead>{t("srcZone")}</TableHead>
                <TableHead>{dnat ? t("externalIp") : t("snatIp")}</TableHead>
                <TableHead>{dnat ? t("externalPort") : t("snatPort")}</TableHead>
                <TableHead>{dnat ? t("internalIp") : t("destIp")}</TableHead>
                <TableHead>{dnat ? t("internalPort") : t("destPort")}</TableHead>
                <TableHead>{t("protocol")}</TableHead>
                <TableHead className="text-right">{tc("enabled")}</TableHead>
                <TableHead className="w-10" />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.ref ?? i}>
                  <TableCell className="font-medium">
                    {r.name || <span className="text-muted-foreground font-mono text-xs">{r.ref}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.src ? `${r.src}${r.dest ? ` → ${r.dest}` : ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{r.srcDip || "—"}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{r.srcDport || "—"}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{r.destIp || "—"}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{r.destPort || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.proto || tc("all")}</TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={r.enabled}
                      disabled={togglePending}
                      onCheckedChange={(v) => onToggle(r.ref, v)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={dnat ? t("editRedirect") : t("editSnat")}
                      aria-label={dnat ? t("editRedirect") : t("editSnat")}
                      onClick={() => onEdit(r)}
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={tc("delete")}
                          aria-label={tc("delete")}
                          disabled={!r.ref}
                        >
                          <Trash2Icon className="text-destructive size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{tc("delete")}</AlertDialogTitle>
                          <AlertDialogDescription>{r.name || r.ref}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => onDelete(r.ref)}>
                            {tc("delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {dnat ? t("noRedirects") : t("noSnat")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ForwardingDialog({
  zones,
  onOpenChange,
}: {
  zones: string[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("firewall");
  const tc = useTranslations("common");
  const [src, setSrc] = useState(zones[0] ?? "");
  const [dest, setDest] = useState(zones[1] ?? zones[0] ?? "");
  const { submit, pending } = useSaveObject(() => onOpenChange(false));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("addForwarding")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <ZoneSelect zones={zones} value={src} onChange={setSrc} />
            <ArrowRightIcon className="text-muted-foreground size-4 shrink-0" />
            <ZoneSelect zones={zones} value={dest} onChange={setDest} />
          </div>
          {/* Forwarding is unidirectional and a zone cannot forward to itself. */}
          <p className="text-muted-foreground text-xs">
            {src && src === dest ? t("forwardingSameZone") : t("forwardingHint")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => submit({ kind: "forwarding", forwarding: { src, dest } }, false)}
            disabled={pending || !src || !dest || src === dest}
          >
            {pending ? tc("applying") : tc("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function policyVariant(p: string): "default" | "secondary" | "destructive" {
  const v = (p || "").toUpperCase();
  if (v === "ACCEPT") return "default";
  if (v === "DROP") return "destructive";
  return "secondary";
}

function PolicyBadge({ policy }: { policy: string }) {
  return (
    <Badge variant={policyVariant(policy)} className="text-[0.65rem]">
      {policy || "—"}
    </Badge>
  );
}

function DefaultsCard({ defaults }: { defaults: FirewallDefaults }) {
  const t = useTranslations("firewall");
  const tc = useTranslations("common");
  const save = useUpdateFirewallDefaults();
  // Draft-only edits layered over the server values; avoids syncing state in
  // an effect and re-bases automatically when the query refreshes.
  const [draft, setDraft] = useState<Partial<FirewallDefaults> | null>(null);
  const form: FirewallDefaults = { ...defaults, ...draft };

  const set = <K extends keyof FirewallDefaults>(key: K, value: FirewallDefaults[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty =
    draft !== null &&
    (form.input !== defaults.input ||
      form.output !== defaults.output ||
      form.forward !== defaults.forward ||
      form.synFlood !== defaults.synFlood ||
      form.dropInvalid !== defaults.dropInvalid ||
      form.fullcone !== defaults.fullcone ||
      form.flowOffloading !== defaults.flowOffloading);

  function onSave() {
    save.mutate(
      {
        input: form.input as Policy,
        output: form.output as Policy,
        forward: form.forward as Policy,
        synFlood: form.synFlood,
        dropInvalid: form.dropInvalid,
        fullcone: form.fullcone,
        flowOffloading: form.flowOffloading,
      },
      {
        onSuccess: (res) => {
          setDraft(null);
          toast.success(res.reloaded ? t("reloadOk") : t("unchanged"));
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  const policies: Policy[] = ["ACCEPT", "REJECT", "DROP"];
  const label = (k: string) => (k === "ACCEPT" ? t("accept") : k === "DROP" ? t("drop") : t("reject"));

  function policySelect(key: "input" | "output" | "forward", value: string) {
    return (
      <Select value={value} onValueChange={(v) => set(key, v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {policies.map((p) => (
            <SelectItem key={p} value={p}>
              {label(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("defaults")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <span className="text-muted-foreground text-xs">{t("input")}</span>
            {policySelect("input", form.input)}
          </div>
          <div className="space-y-1.5">
            <span className="text-muted-foreground text-xs">{t("output")}</span>
            {policySelect("output", form.output)}
          </div>
          <div className="space-y-1.5">
            <span className="text-muted-foreground text-xs">{t("forward")}</span>
            {policySelect("forward", form.forward)}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <SwitchRow
              label={t("synFlood")}
              checked={form.synFlood}
              onChange={(v) => set("synFlood", v)}
            />
            <SwitchRow
              label={t("dropInvalid")}
              checked={form.dropInvalid}
              onChange={(v) => set("dropInvalid", v)}
            />
            <SwitchRow
              label={t("fullcone")}
              checked={form.fullcone}
              onChange={(v) => set("fullcone", v)}
            />
            <SwitchRow
              label={t("flowOffloading")}
              checked={form.flowOffloading}
              onChange={(v) => set("flowOffloading", v)}
            />
          </div>
          <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
            {save.isPending ? tc("applying") : tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomRulesCard() {
  const t = useTranslations("firewall");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch } = useFirewallCustom();
  const save = useSaveFirewallCustom();
  const [draft, setDraft] = useState<string | null>(null);

  const saved = data?.content ?? "";
  const value = draft ?? saved;
  const dirty = draft !== null && draft !== saved;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("customRules")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <>
            <Textarea
              value={value}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              spellCheck={false}
              className="font-mono text-xs"
            />
            <p className="text-muted-foreground text-xs">{t("customRulesHint")}</p>
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!dirty || save.isPending}
                onClick={() =>
                  save.mutate(value, {
                    onSuccess: (res) => {
                      setDraft(null);
                      toast.success(res.reloaded ? t("customSaved") : t("unchanged"));
                    },
                    onError: (e) => toast.error((e as Error).message),
                  })
                }
              >
                {save.isPending ? tc("applying") : t("customSubmit")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function FirewallPage() {
  const t = useTranslations("firewall");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useFirewall();
  const toggle = useToggleFirewallSection();
  const del = useDeleteFirewallSection();
  const ifacesQuery = useIfaceConfig();
  const [zoneDialog, setZoneDialog] = useState<{ initial?: FirewallZone } | null>(null);
  const [ruleDialog, setRuleDialog] = useState<{ initial?: FirewallRule } | null>(null);
  const [redirectDialog, setRedirectDialog] = useState<{
    initial?: FirewallRedirect;
    target: "DNAT" | "SNAT";
  } | null>(null);
  const [forwardingDialog, setForwardingDialog] = useState(false);

  const networkNames = (ifacesQuery.data?.interfaces ?? []).map((i) => i.name);
  const zoneNames = (data?.zones ?? []).map((z) => z.name);
  // LuCI shows port forwards and source NAT on two pages even though both are
  // `redirect` sections; split them the same way so each table stays readable.
  const portForwards = (data?.redirects ?? []).filter((r) => r.target !== "SNAT");
  const sourceNats = (data?.redirects ?? []).filter((r) => r.target === "SNAT");

  function onToggle(ref: string | undefined, enabled: boolean) {
    if (!ref) return;
    toggle.mutate(
      { ref, enabled },
      {
        onSuccess: (res) => toast.success(res.reloaded ? t("reloadOk") : t("unchanged")),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function onDelete(ref: string | undefined) {
    if (!ref) return;
    del.mutate(ref, {
      onSuccess: (res) => toast.success(res.reloaded ? t("reloadOk") : t("unchanged")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  /**
   * How many sections LuCI's `del_zone` would take with the zone, so the
   * confirmation can say what is actually about to disappear.
   */
  function zoneRefCount(name: string) {
    if (!data) return 0;
    const names = (s: { src?: string; dest?: string }) => s.src === name || s.dest === name;
    return (
      data.rules.filter(names).length +
      data.redirects.filter(names).length +
      data.forwarding.filter(names).length
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : (
        <Tabs defaultValue="general" className="min-h-0 flex-1 space-y-4">
          <TabsList>
            <TabsTrigger value="general">{t("tabGeneral")}</TabsTrigger>
            <TabsTrigger value="redirects">{t("tabRedirects")}</TabsTrigger>
            <TabsTrigger value="rules">{t("tabRules")}</TabsTrigger>
            <TabsTrigger value="custom">{t("tabCustom")}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
          <DefaultsCard defaults={data.defaults} />

          {/* Zones */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheckIcon className="text-muted-foreground size-4" />
                {t("zones")}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setZoneDialog({})}
                >
                  <PlusIcon className="size-3.5" />
                  {t("addZone")}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.zones.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {data.zones.map((z) => (
                    <div key={z.ref ?? z.name} className="rounded-lg border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-medium">{z.name}</span>
                        <div className="flex items-center gap-1.5">
                          {z.masq ? <Badge variant="outline" className="text-[0.65rem]">NAT</Badge> : null}
                          {z.mtuFix ? <Badge variant="outline" className="text-[0.65rem]">MTU fix</Badge> : null}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={t("editZone")}
                            aria-label={t("editZone")}
                            onClick={() => setZoneDialog({ initial: z })}
                          >
                            <PencilIcon className="size-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={t("deleteZone")}
                                aria-label={t("deleteZone")}
                                disabled={!z.ref}
                              >
                                <Trash2Icon className="text-destructive size-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("deleteZone")}: {z.name}
                                </AlertDialogTitle>
                                <AlertDialogDescription className="space-y-1">
                                  <span>{t("deleteZoneWarn")}</span>
                                  <span>{t("deleteZoneCascade", { count: zoneRefCount(z.name) })}</span>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={() => onDelete(z.ref)}>
                                  {tc("delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      {z.networks.length > 0 ? (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {z.networks.map((n) => (
                            <Badge key={n} variant="secondary" className="text-[0.65rem]">
                              {n}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          {t("input")} <PolicyBadge policy={z.input} />
                        </span>
                        <span className="text-muted-foreground flex items-center gap-1">
                          {t("output")} <PolicyBadge policy={z.output} />
                        </span>
                        <span className="text-muted-foreground flex items-center gap-1">
                          {t("forward")} <PolicyBadge policy={z.forward} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-6 text-center text-sm">{t("noZones")}</p>
              )}
            </CardContent>
          </Card>

          {/* Forwarding */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t("forwarding")}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setForwardingDialog(true)}
                >
                  <PlusIcon className="size-3.5" />
                  {t("addForwarding")}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.forwarding.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.forwarding.map((f, i) => (
                    <div
                      key={f.ref ?? i}
                      className="flex items-center gap-2 rounded-lg border py-1.5 pr-1.5 pl-3 text-sm"
                    >
                      <Badge variant="secondary">{f.src}</Badge>
                      <ArrowRightIcon className="text-muted-foreground size-3.5" />
                      <Badge variant="secondary">{f.dest}</Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-6"
                            title={t("deleteForwarding")}
                            aria-label={t("deleteForwarding")}
                            disabled={!f.ref}
                          >
                            <XIcon className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("deleteForwarding")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("deleteForwardingWarn")} {f.src} → {f.dest}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => onDelete(f.ref)}>
                              {tc("delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-6 text-center text-sm">{t("noForwarding")}</p>
              )}
            </CardContent>
          </Card>
          </TabsContent>

          <TabsContent value="rules" className="flex min-h-0 flex-col">
          {/* Rules */}
          <Card className="min-h-0 flex-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t("rules")}
                <Badge variant="secondary" className="tabular-nums">
                  {data.rules.length}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setRuleDialog({})}
                >
                  <PlusIcon className="size-3.5" />
                  {t("addRule")}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {data.rules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tc("name")}</TableHead>
                      <TableHead>{t("traffic")}</TableHead>
                      <TableHead>{t("protocol")}</TableHead>
                      <TableHead>{t("destPort")}</TableHead>
                      <TableHead>{t("target")}</TableHead>
                      <TableHead className="text-right">{tc("enabled")}</TableHead>
                      <TableHead className="w-10" />
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rules.map((r, i) => (
                      <TableRow key={r.ref ?? i}>
                        <TableCell className="font-medium">
                          {r.name || <span className="text-muted-foreground font-mono text-xs">{r.ref}</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {`${srcZoneText(t, r.src)} → ${destZoneText(t, r.dest)}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.proto || tc("all")}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{r.destPort || "—"}</TableCell>
                        <TableCell>
                          <PolicyBadge policy={r.target} />
                          {/* `limit` is written by LuCI's rate limit field; fw3 keeps it read-only here. */}
                          {r.limit ? (
                            <span className="text-muted-foreground block font-mono text-[0.65rem]">
                              {r.limit}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={r.enabled}
                            disabled={toggle.isPending}
                            onCheckedChange={(v) => onToggle(r.ref, v)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={t("editRule")}
                            aria-label={t("editRule")}
                            onClick={() => setRuleDialog({ initial: r })}
                          >
                            <PencilIcon className="size-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={tc("delete")}
                                aria-label={tc("delete")}
                                disabled={!r.ref}
                              >
                                <Trash2Icon className="text-destructive size-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{tc("delete")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {r.name || r.ref}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={() => onDelete(r.ref)}
                                >
                                  {tc("delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground py-6 text-center text-sm">{t("noRules")}</p>
              )}
            </CardContent>
          </Card>
          </TabsContent>

          <TabsContent value="redirects" className="flex min-h-0 flex-col gap-4">
            <RedirectCard
              target="DNAT"
              rows={portForwards}
              togglePending={toggle.isPending}
              onAdd={() => setRedirectDialog({ target: "DNAT" })}
              onEdit={(r) => setRedirectDialog({ initial: r, target: "DNAT" })}
              onToggle={onToggle}
              onDelete={onDelete}
            />
            <RedirectCard
              target="SNAT"
              rows={sourceNats}
              togglePending={toggle.isPending}
              onAdd={() => setRedirectDialog({ target: "SNAT" })}
              onEdit={(r) => setRedirectDialog({ initial: r, target: "SNAT" })}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          </TabsContent>

          <TabsContent value="custom">
            <CustomRulesCard />
          </TabsContent>
        </Tabs>
      )}

      {zoneDialog ? (
        <ZoneDialog
          initial={zoneDialog.initial}
          networks={networkNames}
          defaults={data?.defaults ?? FALLBACK_DEFAULTS}
          onOpenChange={(open) => !open && setZoneDialog(null)}
        />
      ) : null}
      {ruleDialog ? (
        <RuleDialog
          initial={ruleDialog.initial}
          zones={zoneNames}
          onOpenChange={(open) => !open && setRuleDialog(null)}
        />
      ) : null}
      {redirectDialog ? (
        <RedirectDialog
          initial={redirectDialog.initial}
          zones={zoneNames}
          target={redirectDialog.target}
          onOpenChange={(open) => !open && setRedirectDialog(null)}
        />
      ) : null}
      {forwardingDialog ? (
        <ForwardingDialog zones={zoneNames} onOpenChange={setForwardingDialog} />
      ) : null}
    </div>
  );
}
