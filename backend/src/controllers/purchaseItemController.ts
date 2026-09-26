import type { Request, Response } from 'express';
import * as itemService from '../services/purchaseItemService.js';
import type { ReplacePurchaseItemsInput } from '../validators/purchaseItem.js';

export async function listItems(req: Request, res: Response) {
  const items = await itemService.listItemsForInvoice(req.params.id!);
  res.json({ success: true, items });
}

export async function replaceItems(req: Request, res: Response) {
  const input = req.body as ReplacePurchaseItemsInput;
  const result = await itemService.replaceItems({
    invoiceId: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role },
    items: input.items.map((i) => ({
      materialId: i.materialId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      notes: i.notes ?? null,
    })),
  });
  res.json({ success: true, invoice: result.invoice, items: result.items });
}