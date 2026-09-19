"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultInstance,
  fieldVisible,
  sectionKey,
  type AppConfigGroup,
  type AppSchema,
  type CandidateOptions,
  type FieldDef,
  type FieldIssue,
  type FieldOption,
  type FieldValue,
  type SectionDef,
  type SectionInstance,
} from "@/lib/openwrt/uci-schema";

/**
 * Schema-driven renderer for UCI-backed luci-app pages: one card per section
 * instance, tabs/fields per the app schema, with add/remove for GridSection-
 * like types and conditional (`depends`) field visibility.
 */

type TFn = ReturnType<typeof useTranslations>;

const NONE = "__none__";

function normalized(value: FieldValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Array.isArray(value)) return value[0] ?? "";
  return value;
}

function instanceTitle(def: SectionDef, inst: SectionInstance, t: TFn): string {
  if (def.titleOption && def.titleOption !== "_ref") {
    const v = normalized(inst.values[def.titleOption]);
    if (v) return v;
  }
  if (inst.ref) return inst.ref;
  return t("newEntry");
}

function DynamicList({
  value,
  onChange,
  addLabel,
  removeLabel,
  placeholder,
}: {
  value: string[];
  onChange: (v: FieldValue) => void;
  addLabel: string;
  removeLabel: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      {value.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            className="font-mono text-xs"
            value={entry}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...value];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={removeLabel}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="xs" onClick={() => onChange([...value, ""])}>
        <PlusIcon className="size-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

function FieldRow({
  field,
  value,
  label,
  slug,
  options,
  candidates,
  issue,
  issueText,
  onChange,
}: {
  field: FieldDef;
  value: FieldValue | undefined;
  label: string;
  slug: string;
  options?: FieldOption[];
  candidates?: CandidateOptions;
  /** Validation failure for this field, if the form was rejected. */
  issue?: FieldIssue;
  issueText?: (issue: FieldIssue) => string;
  onChange: (v: FieldValue) => void;
}) {
  const t = useTranslations("apps");
  const listId = useId();
  const required = field.required ? " *" : "";
  // Select choices carry raw English labels in the schema; apps may translate
  // them per value via `apps.<slug>.o.<value>` (official lmo wording).

  /** LuCI's `sys.net:devices()` list, keeping a stored value that is gone. */
  function deviceOptions(): FieldOption[] {
    const devices = candidates?.devices ?? [];
    const current = normalized(value);
    const names = current && !devices.includes(current) ? [current, ...devices] : devices;
    return names.map((d) => ({ value: d, label: d }));
  }

  /**
   * LuCI's combobox suggestions from the ARP table: the IP field offers
   * addresses, the MAC field offers `mac` labelled with the address it
   * answered. Both stay free-text, exactly like the official widget.
   */
  function suggestions(): FieldOption[] {
    if (field.candidates !== "neighbours") return [];
    const seen = new Set<string>();
    const out: FieldOption[] = [];
    // A `list(macaddr)` widget is rendered as a plain input holding several
    // addresses, so the field's own kind says nothing about the suggestions.
    const isMac = (field.itemKind ?? field.kind) === "mac";
    for (const e of candidates?.neighbours ?? []) {
      const v = isMac ? e.mac : e.ip;
      const label = isMac ? e.ip : e.mac;
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push({ value: v, label });
    }
    return out;
  }

  if (field.kind === "bool") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
        <Label className="font-normal">
          {label}
          {required}
        </Label>
        <Switch checked={value === true} onCheckedChange={(c) => onChange(c)} />
      </div>
    );
  }

  const selectOptions = options ?? field.options ?? (field.candidates === "devices" ? deviceOptions() : undefined);
  const sugg = suggestions();
  // LuCI marks a rejected widget (`cbi-input-invalid`) and repeats the reason
  // under it, so the operator can find the row instead of guessing.
  const hint = issue && issueText ? issueText(issue) : null;

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">
        {label}
        {required}
      </Label>
      {field.kind === "select" ? (
        <Select value={normalized(value) || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
          <SelectTrigger className="w-full" aria-invalid={hint ? true : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(selectOptions ?? []).map((o) => (
              <SelectItem key={o.value || NONE} value={o.value || NONE}>
                {t.has(`${slug}.o.${o.value}`) ? t(`${slug}.o.${o.value}`) : o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.kind === "dynamiclist" ? (
        <DynamicList
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          addLabel={t("addEntry")}
          removeLabel={t("removeEntry")}
          placeholder={field.placeholder}
        />
      ) : field.kind === "textarea" ? (
        <Textarea
          rows={4}
          className="font-mono text-xs"
          value={normalized(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <>
          <Input
            type={field.kind === "int" ? "number" : field.kind === "password" ? "password" : "text"}
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            list={sugg.length > 0 ? listId : undefined}
            aria-invalid={hint ? true : undefined}
            className={
              field.kind === "ip" || field.kind === "mac" || field.kind === "int"
                ? "font-mono text-xs"
                : undefined
            }
            value={normalized(value)}
            onChange={(e) => onChange(e.target.value)}
          />
          {sugg.length > 0 ? (
            <datalist id={listId}>
              {sugg.map((s) => (
                <option key={s.value} value={s.value} label={s.label} />
              ))}
            </datalist>
          ) : null}
        </>
      )}
      {hint ? (
        <p className="text-destructive text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

export function UciForm({
  schema,
  groups,
  onChange,
  fieldLabel,
  candidates,
  issues,
  issueText,
}: {
  schema: AppSchema;
  groups: AppConfigGroup[];
  onChange: (next: AppConfigGroup[]) => void;
  fieldLabel: (field: FieldDef) => string;
  /** Live-system candidates the page fetched for fields that declare them. */
  candidates?: CandidateOptions;
  /** Rejected fields from the last save attempt, marked inline. */
  issues?: FieldIssue[];
  issueText?: (issue: FieldIssue) => string;
}) {
  const t = useTranslations("apps");

  /** LuCI builds several ListValues from sibling sections at render time. */
  function optionsFor(field: FieldDef): FieldOption[] | undefined {
    if (!field.optionsFrom) return undefined;
    const gi = schema.sections.findIndex((s) => s.type === field.optionsFrom?.section);
    const group = gi >= 0 ? groups[gi] : undefined;
    const derived = (group?.instances ?? [])
      .filter((inst) => inst.ref)
      .map((inst) => ({
        value: inst.ref as string,
        label:
          (field.optionsFrom?.labelOption
            ? normalized(inst.values[field.optionsFrom.labelOption])
            : "") || (inst.ref as string),
      }));
    return [...(field.optionsFrom.prepend ?? []), ...derived];
  }

  function updateInstance(gi: number, ii: number, values: Record<string, FieldValue>) {
    onChange(
      groups.map((g, i) =>
        i !== gi
          ? g
          : {
              ...g,
              instances: g.instances.map((inst, j) => (j !== ii ? inst : { ...inst, values })),
            },
      ),
    );
  }

  function addInstance(gi: number) {
    const def = schema.sections[gi];
    onChange(
      groups.map((g, i) =>
        i !== gi ? g : { ...g, instances: [...g.instances, defaultInstance(def, candidates)] },
      ),
    );
  }

  function removeInstance(gi: number, ii: number) {
    onChange(
      groups.map((g, i) =>
        i !== gi ? g : { ...g, instances: g.instances.filter((_, j) => j !== ii) },
      ),
    );
  }

  return (
    <div className="space-y-6">
      {schema.sections.map((def, gi) => {
        const group = groups[gi];
        if (!group) return null;
        const key = sectionKey(def);
        // Flat index of this group's first instance: validation issues address
        // instances the way the page submits them (`groups.flatMap`).
        const offset = groups.slice(0, gi).reduce((n, g) => n + g.instances.length, 0);
        const issueFor = (flat: number, option: string) =>
          issues?.find((i) => i.index === flat && i.option === option);
        const sectionTitle = t.has(`${schema.slug}.s.${key}`)
          ? t(`${schema.slug}.s.${key}`)
          : def.type;
        return (
          <section key={key} className="space-y-3">
            {/* Official CBI renders the section title as a fieldset legend. */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{sectionTitle}</h3>
              {def.multiple ? (
                <Button variant="outline" size="xs" onClick={() => addInstance(gi)}>
                  <PlusIcon className="size-3.5" />
                  {t("addEntry")}
                </Button>
              ) : null}
            </div>

            {group.instances.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                {t("noEntries")}
              </p>
            ) : null}

            {group.instances.map((inst, ii) => (
              <Card key={inst.ref ?? `new-${ii}`}>
                {/* Singleton sections are already labelled by the legend above;
                    only repeatable ones need a per-instance header. */}
                {def.multiple ? (
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">{instanceTitle(def, inst, t)}</CardTitle>
                    <CardAction>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive size-7"
                        onClick={() => removeInstance(gi, ii)}
                        aria-label={t("removeEntry")}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </CardAction>
                  </CardHeader>
                ) : null}
                <CardContent>
                  {def.tabs && def.tabs.length > 0 ? (
                    <Tabs defaultValue={def.tabs[0].id}>
                      <TabsList>
                        {def.tabs.map((tab) => (
                          <TabsTrigger key={tab.id} value={tab.id}>
                            {t.has(`${schema.slug}.t.${tab.id}`)
                              ? t(`${schema.slug}.t.${tab.id}`)
                              : tab.id}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {def.tabs.map((tab) => (
                        <TabsContent key={tab.id} value={tab.id}>
                          <div className="grid gap-4 md:grid-cols-2">
                            {tab.fields
                              .filter((f) => !f.hidden && fieldVisible(f, inst.values))
                              .map((f) => (
                                <FieldRow
                                  key={f.option}
                                  field={f}
                                  value={inst.values[f.option]}
                                  label={fieldLabel(f)}
                                  slug={schema.slug}
                                  options={optionsFor(f)}
                                  candidates={candidates}
                                  issue={issueFor(offset + ii, f.option)}
                                  issueText={issueText}
                                  onChange={(v) =>
                                    updateInstance(gi, ii, { ...inst.values, [f.option]: v })
                                  }
                                />
                              ))}
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {(def.fields ?? [])
                        .filter((f) => !f.hidden && fieldVisible(f, inst.values))
                        .map((f) => (
                          <FieldRow
                            key={f.option}
                            field={f}
                            value={inst.values[f.option]}
                            label={fieldLabel(f)}
                            slug={schema.slug}
                            options={optionsFor(f)}
                            candidates={candidates}
                            issue={issueFor(offset + ii, f.option)}
                            issueText={issueText}
                            onChange={(v) =>
                              updateInstance(gi, ii, { ...inst.values, [f.option]: v })
                            }
                          />
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </section>
        );
      })}
    </div>
  );
}
