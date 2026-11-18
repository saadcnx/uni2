"use client";

import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { formatAmount } from "../receiptFormat";
import type { Patient, Receipt } from "../types";

const PRINT_WINDOW_FEATURES = "width=420,height=640";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

type ReceiptPatient = Pick<Patient, "name" | "patientCode" | "phone">;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function printReceipt(patient: ReceiptPatient, receipt: Receipt) {
  const rows = receipt.items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td class="amount">${escapeHtml(
          formatAmount(item.price)
        )}</td></tr>`
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
<title>${escapeHtml(receipt.receiptNumber)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; padding: 16px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  td { padding: 6px 0; border-bottom: 1px solid #ddd; }
  .amount { text-align: right; white-space: nowrap; }
  .total td { font-weight: bold; border-bottom: none; border-top: 2px solid #111; }
</style>
</head>
<body>
  <h1>Payment Receipt</h1>
  <p>Receipt: ${escapeHtml(receipt.receiptNumber)}</p>
  <p>Date: ${escapeHtml(formatDateTime(receipt.createdAt))}</p>
  <p>Patient: ${escapeHtml(patient.name)} (${escapeHtml(patient.patientCode)})</p>
  <p>Phone: ${escapeHtml(patient.phone)}</p>
  <table>
    ${rows}
    <tr class="total"><td>Total</td><td class="amount">${escapeHtml(
      formatAmount(receipt.totalAmount)
    )}</td></tr>
  </table>
</body>
</html>`;

  const printWindow = window.open("", "_blank", PRINT_WINDOW_FEATURES);
  if (!printWindow) {
    toast.error("Allow pop-ups to print the receipt");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export interface ReceiptDialogProps {
  patient: ReceiptPatient | null;
  receipt: Receipt | null;
  onClose: () => void;
}

export function ReceiptDialog({ patient, receipt, onClose }: ReceiptDialogProps) {
  return (
    <Dialog
      open={Boolean(patient && receipt)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        {patient && receipt && (
          <>
            <DialogHeader>
              <DialogTitle>Receipt {receipt.receiptNumber}</DialogTitle>
              <DialogDescription>
                {formatDateTime(receipt.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="rounded-md border border-border p-3 space-y-1">
                <p className="font-medium text-foreground">{patient.name}</p>
                <p className="text-muted-foreground tabular-nums">
                  {patient.patientCode} · {patient.phone}
                </p>
              </div>

              <div className="space-y-2">
                {receipt.items.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="flex justify-between gap-4"
                  >
                    <span>{item.name}</span>
                    <span className="tabular-nums">
                      {formatAmount(item.price)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between border-t border-border pt-3 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatAmount(receipt.totalAmount)}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button
                onClick={() => printReceipt(patient, receipt)}
                className="gap-2 cursor-pointer"
              >
                <Printer className="size-4" />
                Print
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}