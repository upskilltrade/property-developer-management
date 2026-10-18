export const bankPurposes = ["GENERAL", "CUSTOMER_RECEIPTS", "CONSTRUCTION", "ESCROW", "LOAN"] as const;
export const bankAccountTypes = ["SAVINGS", "CURRENT", "FIXED"] as const;

/** Suggestions for the bank name field; any other name can be typed. */
export const thaiBanks = [
  "ธนาคารกรุงเทพ",
  "ธนาคารกสิกรไทย",
  "ธนาคารกรุงไทย",
  "ธนาคารไทยพาณิชย์",
  "ธนาคารกรุงศรีอยุธยา",
  "ธนาคารทหารไทยธนชาต",
  "ธนาคารยูโอบี",
  "ธนาคารซีไอเอ็มบี ไทย",
  "ธนาคารเกียรตินาคินภัทร",
  "ธนาคารทิสโก้",
  "ธนาคารแลนด์ แอนด์ เฮ้าส์",
  "ธนาคารออมสิน",
  "ธนาคารอาคารสงเคราะห์",
  "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร",
  "ธนาคารอิสลามแห่งประเทศไทย",
];

export type BankAccount = {
  id: string;
  code: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  account_number_masked: string | null;
  branch: string | null;
  account_type: string | null;
  purpose: string;
  promptpay_id: string | null;
  show_to_customers: boolean;
  is_default_receipt: boolean;
  opening_balance: number | string;
  opening_date: string;
  notes: string | null;
  active: boolean;
};

/** Groups a 10-digit account number the way Thai banks print it (xxx-x-xxxxx-x). */
export function formatAccountNumber(n: string | null | undefined) {
  if (!n) return "";
  return /^\d{10}$/.test(n) ? `${n.slice(0, 3)}-${n.slice(3, 4)}-${n.slice(4, 9)}-${n.slice(9)}` : n;
}
