import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, FolderPlus, Layers, Palette, Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney } from "@/lib/format";
import { disciplines, materialCategories, revisionTone, selectionTone } from "@/lib/design";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { StorageUploadForm } from "@/components/domain/storage-upload-form";
import {
  createDrawing,
  createPackage,
  proposeSelection,
  publishSelection,
  saveMaterial,
  setMaterialImage,
} from "./actions";

export const metadata: Metadata = { title: "Design" };

type View = "drawings" | "selections" | "materials";

/** Design control for one project: drawing register, unit material selections, material library. */
export default async function ProjectDesign({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ view?: string; discipline?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const q = await searchParams;
  const view: View = q.view === "selections" || q.view === "materials" ? q.view : "drawings";
  const { supabase } = await getSession(locale);
  const d = t.design;
  const base = `/${locale}/app/projects/${id}/design`;
  const back = `${base}?view=${view}`;

  const { data: project } = await supabase
    .from("projects")
    .select("id,organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const [
    { data: packages },
    { data: drawings },
    { data: units },
    { data: houseTypes },
    { data: materials },
  ] = await Promise.all([
    supabase
      .from("design_packages")
      .select(
        "id,scope,code,name,unit_id,house_type_id,parent_package_id,units(code),house_types(code,name)",
      )
      .eq("project_id", id)
      .order("code"),
    supabase
      .from("drawings")
      .select(
        "id,package_id,discipline,drawing_no,title,customer_visible,current:drawing_revisions!drawings_current_revision_fk(revision_code,released_at),revs:drawing_revisions!drawing_revisions_drawing_id_fkey(revision_code,status)",
      )
      .eq("project_id", id)
      .order("drawing_no"),
    supabase.from("units").select("id,code").eq("project_id", id).order("code"),
    supabase.from("house_types").select("id,code,name").eq("active", true).order("code"),
    supabase
      .from("materials")
      .select("id,code,category,name_th,name_en,brand,spec,price_delta,image_path,active")
      .order("code"),
  ]);
  const { data: selections } =
    view === "selections"
      ? await supabase
          .from("material_selections")
          .select(
            "id,unit_id,area,version,status,note,created_at,materials(code,name_th,name_en,brand)",
          )
          .eq("project_id", id)
          .neq("status", "SUPERSEDED")
          .order("area")
      : { data: [] };

  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const pkgById = new Map((packages ?? []).map((p) => [p.id, p]));
  const pkgLabel = (p: (typeof packages & object)[number] | undefined) =>
    p ? `${p.code} · ${p.name}` : "—";
  const filtered = (drawings ?? []).filter((x) => !q.discipline || x.discipline === q.discipline);
  const matName = (m: { name_th: string; name_en: string | null } | null | undefined) =>
    m ? (locale === "en" && m.name_en) || m.name_th : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          active={view}
          items={[
            { key: "drawings", label: d.views.drawings, href: `${base}?view=drawings` },
            { key: "selections", label: d.views.selections, href: `${base}?view=selections` },
            { key: "materials", label: d.views.materials, href: `${base}?view=materials` },
          ]}
        />
      </div>

      {view === "drawings" ? (
        <>
          <Panel
            title={d.packages}
            actions={
              <Sheet
                title={d.newPackage}
                triggerLabel={d.newPackage}
                triggerIcon={<FolderPlus />}
                triggerVariant="secondary"
                triggerSize="xs"
              >
                <form action={createPackage} className="space-y-3">
                  <Hidden values={{ locale, return_to: back, project_id: id }} />
                  <Field label={d.scope.MASTER + " / " + d.scope.UNIT} required>
                    <Select name="scope" defaultValue="MASTER">
                      <option value="MASTER">{d.scope.MASTER}</option>
                      <option value="UNIT">{d.scope.UNIT}</option>
                    </Select>
                  </Field>
                  <FormGrid>
                    <Field label={d.houseType} hint={d.scope.MASTER}>
                      <Select name="house_type_id" defaultValue="">
                        <option value="">—</option>
                        {(houseTypes ?? []).map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.code} · {h.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={d.unit} hint={d.scope.UNIT}>
                      <Select name="unit_id" defaultValue="">
                        <option value="">—</option>
                        {(units ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </FormGrid>
                  <FormGrid>
                    <Field label={d.code} required>
                      <Input name="code" required placeholder="TH-A / UNIT-01" />
                    </Field>
                    <Field label={d.name} required>
                      <Input name="name" required />
                    </Field>
                  </FormGrid>
                  <SheetFooter>
                    <SubmitButton>{t.common.save}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            }
          >
            {packages?.length ? (
              <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {packages.map((p) => (
                  <li key={p.id} className="rounded-md border border-line px-3 py-2 text-[13px]">
                    <div className="flex items-center gap-2">
                      <Layers className="size-3.5 text-muted" />
                      <span className="font-mono font-semibold">{p.code}</span>
                      <Badge tone={p.scope === "MASTER" ? "accent" : "info"}>
                        {label(d.scope, p.scope)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate">{p.name}</p>
                    <p className="text-2xs text-muted">
                      {p.scope === "UNIT" ? one(p.units)?.code : (one(p.house_types)?.code ?? "—")}
                      {p.parent_package_id
                        ? ` · ${d.inherits} ${pkgById.get(p.parent_package_id)?.code}`
                        : ""}
                      {" · "}
                      {(drawings ?? []).filter((x) => x.package_id === p.id).length}{" "}
                      {d.views.drawings}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Layers />} title="—" />
            )}
          </Panel>

          <Panel
            title={d.views.drawings}
            actions={
              <div className="flex items-center gap-2">
                <form className="flex items-center gap-1">
                  <input type="hidden" name="view" value="drawings" />
                  <Select
                    name="discipline"
                    defaultValue={q.discipline ?? ""}
                    className="h-7 w-36 text-2xs"
                  >
                    <option value="">
                      {d.discipline}: {t.common.all}
                    </option>
                    {disciplines.map((x) => (
                      <option key={x} value={x}>
                        {t.status.discipline[x]}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="submit"
                    className="h-7 rounded border border-line-strong px-2 text-2xs"
                  >
                    {t.common.filter}
                  </button>
                </form>
                {packages?.length ? (
                  <Sheet
                    title={d.newDrawing}
                    triggerLabel={d.newDrawing}
                    triggerIcon={<Plus />}
                    triggerSize="xs"
                  >
                    <form action={createDrawing} className="space-y-3">
                      <Hidden values={{ locale, return_to: base }} />
                      <Field label={d.package} required>
                        <Select name="package_id" required>
                          {packages.map((p) => (
                            <option key={p.id} value={p.id}>
                              {pkgLabel(p)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <FormGrid>
                        <Field label={d.discipline} required>
                          <Select name="discipline" defaultValue="ARCHITECTURE">
                            {disciplines.map((x) => (
                              <option key={x} value={x}>
                                {t.status.discipline[x]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={d.drawingNo} required>
                          <Input name="drawing_no" required placeholder="A-101" />
                        </Field>
                      </FormGrid>
                      <Field label={d.drawingTitle} required>
                        <Input name="title" required />
                      </Field>
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" name="customer_visible" />
                        {d.customerVisible}
                      </label>
                      <SheetFooter>
                        <SubmitButton>{t.common.save}</SubmitButton>
                      </SheetFooter>
                    </form>
                  </Sheet>
                ) : null}
              </div>
            }
          >
            {filtered.length ? (
              <Table>
                <THead>
                  <tr>
                    <TH>{d.drawingNo}</TH>
                    <TH>{d.drawingTitle}</TH>
                    <TH>{d.discipline}</TH>
                    <TH>{d.package}</TH>
                    <TH>{d.currentReleased}</TH>
                    <TH>{d.openRevision}</TH>
                    <TH>{d.customerVisible}</TH>
                  </tr>
                </THead>
                <tbody>
                  {filtered.map((x) => {
                    const current = one(x.current);
                    const open = (x.revs ?? []).find((r) =>
                      ["DRAFT", "IN_REVIEW", "APPROVED"].includes(r.status),
                    );
                    return (
                      <TR key={x.id}>
                        <TD>
                          <Link
                            href={`${base}/drawings/${x.id}`}
                            className="font-mono text-[12px] font-semibold hover:text-brand hover:underline"
                          >
                            {x.drawing_no}
                          </Link>
                        </TD>
                        <TD>{x.title}</TD>
                        <TD className="text-muted">{label(t.status.discipline, x.discipline)}</TD>
                        <TD className="font-mono text-[12px] text-muted">
                          {pkgById.get(x.package_id)?.code}
                        </TD>
                        <TD>
                          {current ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Badge tone="success">
                                {d.revision} {current.revision_code}
                              </Badge>
                              <span className="text-2xs text-muted">
                                {formatDate(locale, current.released_at)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-2xs text-faint">{d.noneReleased}</span>
                          )}
                        </TD>
                        <TD>
                          {open ? (
                            <Badge tone={revisionTone[open.status] ?? "neutral"}>
                              {open.revision_code} · {label(t.status.drawingStatus, open.status)}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD>
                          {x.customer_visible ? <Eye className="size-4 text-emerald-600" /> : "—"}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<Layers />} title={d.noDrawings} />
            )}
          </Panel>
        </>
      ) : null}

      {view === "selections" ? (
        <Panel
          title={d.views.selections}
          description={d.proposeHint}
          actions={
            materials?.length && units?.length ? (
              <Sheet
                title={d.propose}
                description={d.proposeHint}
                triggerLabel={d.propose}
                triggerSize="xs"
              >
                <form action={proposeSelection} className="space-y-3">
                  <Hidden values={{ locale, return_to: back }} />
                  <FormGrid>
                    <Field label={d.unit} required>
                      <Select name="unit_id" required>
                        {(units ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={d.area} required>
                      <Input name="area" required placeholder="ห้องนั่งเล่น / Living room" />
                    </Field>
                  </FormGrid>
                  <Field label={d.material} required>
                    <Select name="material_id" required>
                      {(materials ?? [])
                        .filter((m) => m.active)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.code} · {matName(m)} ({label(t.status.materialCategory, m.category)})
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label={d.note}>
                    <Textarea name="note" />
                  </Field>
                  <SheetFooter>
                    <SubmitButton>{d.propose}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            ) : null
          }
        >
          {selections?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{d.unit}</TH>
                  <TH>{d.area}</TH>
                  <TH>{d.material}</TH>
                  <TH>{d.version}</TH>
                  <TH>{t.common.status}</TH>
                  <TH>{t.common.actions}</TH>
                </tr>
              </THead>
              <tbody>
                {selections.map((s) => {
                  const m = one(s.materials);
                  return (
                    <TR key={s.id}>
                      <TD className="font-mono text-[12px]">
                        {units?.find((u) => u.id === s.unit_id)?.code}
                      </TD>
                      <TD>{s.area}</TD>
                      <TD>
                        <span className="font-mono text-[12px] text-muted">{m?.code}</span>{" "}
                        {matName(m)}
                        {m?.brand ? (
                          <span className="text-2xs text-muted"> · {m.brand}</span>
                        ) : null}
                      </TD>
                      <TD className="num text-muted">v{s.version}</TD>
                      <TD>
                        <Badge tone={selectionTone[s.status] ?? "neutral"}>
                          {label(t.status.selection, s.status)}
                        </Badge>
                      </TD>
                      <TD>
                        {s.status === "DRAFT" ? (
                          <form action={publishSelection}>
                            <Hidden values={{ locale, return_to: back, selection_id: s.id }} />
                            <SubmitButton size="xs">{d.publish}</SubmitButton>
                          </form>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Palette />} title={d.noSelections} />
          )}
        </Panel>
      ) : null}

      {view === "materials" ? (
        <Panel
          title={d.materials}
          actions={
            <Sheet title={d.newMaterial} triggerLabel={d.newMaterial} triggerSize="xs">
              <form action={saveMaterial} className="space-y-3">
                <Hidden
                  values={{ locale, return_to: back, organization_id: project.organization_id }}
                />
                <FormGrid>
                  <Field label={d.materialCode} required>
                    <Input name="code" required placeholder="FL-01" />
                  </Field>
                  <Field label={d.category} required>
                    <Select name="category" defaultValue="FLOOR">
                      {materialCategories.map((c) => (
                        <option key={c} value={c}>
                          {t.status.materialCategory[c]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FormGrid>
                <FormGrid>
                  <Field label={d.nameTh} required>
                    <Input name="name_th" required />
                  </Field>
                  <Field label={d.nameEn}>
                    <Input name="name_en" />
                  </Field>
                </FormGrid>
                <FormGrid>
                  <Field label={d.brand}>
                    <Input name="brand" />
                  </Field>
                  <Field label={d.priceDelta}>
                    <Input name="price_delta" type="number" step="any" defaultValue="0" />
                  </Field>
                </FormGrid>
                <Field label={d.spec}>
                  <Textarea name="spec" />
                </Field>
                <SheetFooter>
                  <SubmitButton>{t.common.save}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          }
        >
          {materials?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{d.materialCode}</TH>
                  <TH>{d.name}</TH>
                  <TH>{d.category}</TH>
                  <TH>{d.brand}</TH>
                  <TH align="right">{d.priceDelta}</TH>
                  <TH>{d.image}</TH>
                </tr>
              </THead>
              <tbody>
                {materials.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-mono text-[12px] font-semibold">{m.code}</TD>
                    <TD>
                      {matName(m)}
                      {m.spec ? <p className="text-[10px] text-muted">{m.spec}</p> : null}
                    </TD>
                    <TD className="text-muted">{label(t.status.materialCategory, m.category)}</TD>
                    <TD className="text-muted">{m.brand ?? "—"}</TD>
                    <TD align="right">
                      {Number(m.price_delta) ? formatMoney(locale, m.price_delta) : "—"}
                    </TD>
                    <TD>
                      <Sheet
                        title={`${d.image} · ${m.code}`}
                        triggerLabel={m.image_path ? "✓" : d.image}
                        triggerIcon={<Palette />}
                        triggerVariant="ghost"
                        triggerSize="xs"
                      >
                        <StorageUploadForm
                          action={setMaterialImage}
                          hidden={{ locale, return_to: back, material_id: m.id }}
                          bucket="design-files"
                          folder={`${project.organization_id}/materials/${m.id}`}
                          accept="image/*"
                          labels={{
                            file: d.image,
                            submit: t.common.save,
                            uploadFailed: d.uploadFailed,
                          }}
                        />
                      </Sheet>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Palette />} title={d.noMaterials} />
          )}
        </Panel>
      ) : null}
    </div>
  );
}
