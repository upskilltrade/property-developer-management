import { Ban } from "lucide-react";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, Hidden, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

/** Void a wrong or duplicate site photo with a reason; it is hidden everywhere, including the customer portal. */
export function VoidPhotoForm({
  action,
  hidden,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  labels: { voidPhoto: string; voidReason: string; hint: string };
}) {
  return (
    <Sheet
      title={labels.voidPhoto}
      description={labels.hint}
      triggerLabel={labels.voidPhoto}
      triggerIcon={<Ban />}
      triggerVariant="ghost"
      triggerSize="xs"
    >
      <form action={action} className="space-y-3">
        <Hidden values={hidden} />
        <Field label={labels.voidReason} required>
          <Input name="reason" required />
        </Field>
        <SheetFooter>
          <SubmitButton variant="danger">{labels.voidPhoto}</SubmitButton>
        </SheetFooter>
      </form>
    </Sheet>
  );
}
