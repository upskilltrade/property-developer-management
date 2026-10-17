"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, num, optStr, str, withFlash } from "@/lib/form";
import { today } from "@/lib/format";

type Tab = "documents" | "contracts" | "allocations";

async function context(fd: FormData, tab: Tab) {
  const locale = formLocale(fd);
  const projectId = str(fd, "project_id");
  if (!projectId) redirect(`/${locale}/app/projects`);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const back = `/${locale}/app/projects/${projectId}/finance?tab=${tab}`;
  const fail = (key: string): never => redirect(withFlash(back, "error", key));
  const done = (key: string): never => {
    revalidatePath(`/${locale}/app`, "layout");
    redirect(withFlash(back, "saved", key));
  };
  const organizationId = async () => {
    const { data } = await supabase
      .from("projects")
      .select("organization_id")
      .eq("id", projectId)
      .single();
    return data?.organization_id ?? fail("project");
  };
  return { projectId, supabase, user, fail, done, organizationId };
}

const docNo = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function createFinancialDocument(fd: FormData) {
  const { projectId, supabase, user, fail, done, organizationId } = await context(fd, "documents");
  const type = str(fd, "document_type");
  const amount = num(fd, "amount") ?? 0;
  const vatRate = num(fd, "vat_rate") ?? 0;
  const whtRate = num(fd, "wht_rate") ?? 0;
  const category = optStr(fd, "cost_category_id");
  const source = optStr(fd, "source_document_id");
  const cashAccount = optStr(fd, "cash_account_id");
  const isInvoice = type === "AP" || type === "AR";
  const isCash = type === "PAYMENT" || type === "RECEIPT";

  if (
    !["COMMITMENT", "AP", "AR", "PAYMENT", "RECEIPT"].includes(type) ||
    amount <= 0 ||
    vatRate < 0 ||
    vatRate > 100 ||
    whtRate < 0 ||
    whtRate >= 100
  )
    fail("invalid");
  if ((type === "COMMITMENT" || type === "AP") && !category) fail("invalid");
  if (isCash && !cashAccount) fail("invalid");
  if (isCash && vatRate > 0) fail("invalid");

  const { error } = await supabase.from("financial_documents").insert({
    organization_id: await organizationId(),
    project_id: projectId,
    document_type: type,
    document_no: docNo(type),
    document_date: optStr(fd, "document_date") ?? today(),
    counterparty_type: type === "RECEIPT" || type === "AR" ? "CUSTOMER" : "VENDOR",
    counterparty_name: optStr(fd, "counterparty_name"),
    cost_category_id: category,
    source_document_id: source,
    cash_account_id: cashAccount,
    receipt_purpose:
      type === "RECEIPT"
        ? source
          ? "AR_SETTLEMENT"
          : (optStr(fd, "receipt_purpose") ?? "DIRECT_REVENUE")
        : null,
    tax_base_amount: isInvoice ? amount : null,
    vat_rate: vatRate,
    vat_amount: isInvoice ? round2((amount * vatRate) / 100) : 0,
    wht_rate: whtRate,
    wht_amount: isCash ? round2((amount * whtRate) / (100 - whtRate || 100)) : 0,
    tax_invoice_no: optStr(fd, "tax_invoice_no"),
    counterparty_tax_id: optStr(fd, "counterparty_tax_id"),
    amount,
    status: "DRAFT",
    description: str(fd, "description"),
    created_by: user.id,
  });
  if (error) fail("document");
  done("document");
}

async function runDocumentRpc(fd: FormData, rpc: string, key: string) {
  const { supabase, fail, done } = await context(fd, "documents");
  const { error } = await supabase.rpc(rpc, { target_document: str(fd, "document_id") });
  if (error) fail(key);
  done(key);
}

export async function approveFinancialDocument(fd: FormData) {
  await runDocumentRpc(fd, "approve_financial_document", "approve");
}

export async function postApprovedFinancialDocument(fd: FormData) {
  await runDocumentRpc(fd, "post_approved_financial_document", "post");
}

export async function postFinancialDocument(fd: FormData) {
  await runDocumentRpc(fd, "post_financial_document", "post");
}

export async function createProcurementContract(fd: FormData) {
  const { projectId, supabase, user, fail, done, organizationId } = await context(fd, "contracts");
  const contractType = str(fd, "contract_type");
  const vendor = str(fd, "vendor_name");
  const category = str(fd, "cost_category_id");
  const amount = num(fd, "amount") ?? 0;
  if (!["PO", "CONTRACT"].includes(contractType) || !vendor || !category || amount <= 0)
    fail("invalid");

  const { error } = await supabase.from("procurement_contracts").insert({
    organization_id: await organizationId(),
    project_id: projectId,
    contract_no: docNo(contractType === "PO" ? "PO" : "CT"),
    contract_type: contractType,
    vendor_name: vendor,
    cost_category_id: category,
    contract_date: optStr(fd, "contract_date") ?? today(),
    amount,
    status: "DRAFT",
    description: str(fd, "description"),
    created_by: user.id,
  });
  if (error) fail("contract");
  done("contract");
}

export async function approveProcurementContract(fd: FormData) {
  const { supabase, fail, done } = await context(fd, "contracts");
  const { error } = await supabase.rpc("approve_procurement_contract", {
    target_contract: str(fd, "contract_id"),
  });
  if (error) fail("contract_approve");
  done("contract_approve");
}

export async function createCostAllocation(fd: FormData) {
  const { projectId, supabase, user, fail, done, organizationId } = await context(
    fd,
    "allocations",
  );
  const method = str(fd, "method");
  const amount = num(fd, "source_amount") ?? 0;
  if (!["LAND_AREA", "GFA", "SALES_VALUE"].includes(method) || amount <= 0) fail("invalid");

  const { data: run, error } = await supabase
    .from("cost_allocation_runs")
    .insert({
      organization_id: await organizationId(),
      project_id: projectId,
      source_document_id: optStr(fd, "source_document_id"),
      allocation_no: docNo("ALLOC"),
      allocation_date: today(),
      method,
      source_amount: amount,
      status: "DRAFT",
      description: str(fd, "description"),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !run) fail("allocation");
  const { error: generateError } = await supabase.rpc("generate_cost_allocation", {
    target_run: run!.id,
  });
  if (generateError) fail("allocation_basis");
  done("allocation");
}

export async function postCostAllocation(fd: FormData) {
  const { supabase, fail, done } = await context(fd, "allocations");
  const { error } = await supabase.rpc("post_cost_allocation", {
    target_run: str(fd, "allocation_run_id"),
  });
  if (error) fail("allocation_post");
  done("allocation_post");
}
