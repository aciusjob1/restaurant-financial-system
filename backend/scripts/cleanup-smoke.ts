import { prisma } from '../src/lib/prisma.js';

async function main() {
  const smokeUsers = await prisma.user.findMany({
    where: {
      OR: [
        { username: { startsWith: 'smoke-' } },
        { username: { startsWith: 'smoke_' } },
      ],
    },
    select: { id: true, username: true },
  });
  const ids = smokeUsers.map((u) => u.id);
  console.log('found ' + ids.length + ' smoke users');
  if (ids.length === 0) { console.log('nothing to do'); return; }

  // 1. Null out every nullable FK to User we might touch.
  const nullOps = [];
  nullOps.push(['Shift.openingCashSetByUserId', (await prisma.shift.updateMany({
    where: { openingCashSetByUserId: { in: ids } }, data: { openingCashSetByUserId: null },
  })).count]);
  nullOps.push(['CashHandover.voidedBy', (await prisma.cashHandover.updateMany({
    where: { voidedBy: { in: ids } }, data: { voidedBy: null },
  })).count]);
  nullOps.push(['Expense.approvedBy', (await prisma.expense.updateMany({
    where: { approvedBy: { in: ids } }, data: { approvedBy: null },
  })).count]);
  nullOps.push(['SalaryRecord.approvedBy', (await prisma.salaryRecord.updateMany({
    where: { approvedBy: { in: ids } }, data: { approvedBy: null },
  })).count]);
  nullOps.push(['SalaryPayment.voidedBy', (await prisma.salaryPayment.updateMany({
    where: { voidedBy: { in: ids } }, data: { voidedBy: null },
  })).count]);
  nullOps.push(['SupplierPayment.voidedBy', (await prisma.supplierPayment.updateMany({
    where: { voidedBy: { in: ids } }, data: { voidedBy: null },
  })).count]);
  nullOps.push(['PurchaseInvoice.postedBy', (await prisma.purchaseInvoice.updateMany({
    where: { postedBy: { in: ids } }, data: { postedBy: null },
  })).count]);
  nullOps.push(['PurchaseInvoice.cancelledBy', (await prisma.purchaseInvoice.updateMany({
    where: { cancelledBy: { in: ids } }, data: { cancelledBy: null },
  })).count]);
  nullOps.push(['PaymentAllocation.voidedBy', (await prisma.paymentAllocation.updateMany({
    where: { voidedBy: { in: ids } }, data: { voidedBy: null },
  })).count]);
  console.log('--- nullable FKs set to null ---');
  for (const pair of nullOps) {
    if (pair[1] > 0) console.log('  ' + pair[0] + ': ' + pair[1]);
  }

  // 2. Dependent entities owned by smoke users.
  const smokeShifts = await prisma.shift.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  const smokeShiftIds = smokeShifts.map((s) => s.id);
  const smokeSuppliers = await prisma.supplier.findMany({ where: { createdBy: { in: ids } }, select: { id: true } });
  const smokeSupplierIds = smokeSuppliers.map((s) => s.id);
  const smokeMaterials = await prisma.material.findMany({ where: { createdBy: { in: ids } }, select: { id: true } });
  const smokeMaterialIds = smokeMaterials.map((m) => m.id);

  console.log('--- dependent entities ---');
  console.log('  shifts: ' + smokeShiftIds.length);
  console.log('  suppliers: ' + smokeSupplierIds.length);
  console.log('  materials: ' + smokeMaterialIds.length);

  const del = async (name, p) => {
    const r = await p;
    console.log('  ' + name + ': ' + r.count);
  };

  console.log('--- deletions ---');
  await del('paymentAllocations', prisma.paymentAllocation.deleteMany({
    where: { OR: [
      { purchaseInvoice: { supplierId: { in: smokeSupplierIds } } },
      { supplierPayment: { supplierId: { in: smokeSupplierIds } } },
    ] },
  }));
  await del('stockMovements', prisma.stockMovement.deleteMany({
    where: { OR: [
      { createdBy: { in: ids } },
      { materialId: { in: smokeMaterialIds } },
    ] },
  }));
  await del('purchaseItems', prisma.purchaseItem.deleteMany({
    where: { OR: [
      { materialId: { in: smokeMaterialIds } },
      { purchaseInvoice: { supplierId: { in: smokeSupplierIds } } },
    ] },
  }));
  await del('supplierPayments', prisma.supplierPayment.deleteMany({
    where: { OR: [
      { recordedBy: { in: ids } },
      { supplierId: { in: smokeSupplierIds } },
    ] },
  }));
  await del('purchaseInvoices', prisma.purchaseInvoice.deleteMany({
    where: { OR: [
      { createdBy: { in: ids } },
      { supplierId: { in: smokeSupplierIds } },
    ] },
  }));
  await del('suppliers', prisma.supplier.deleteMany({ where: { id: { in: smokeSupplierIds } } }));
  await del('salaryPayments', prisma.salaryPayment.deleteMany({ where: { recordedBy: { in: ids } } }));
  await del('salaryRecords', prisma.salaryRecord.deleteMany({ where: { createdBy: { in: ids } } }));
  await del('employees', prisma.employee.deleteMany({ where: { userId: { in: ids } } }));
  await del('materials', prisma.material.deleteMany({ where: { id: { in: smokeMaterialIds } } }));
  await del('materialCategories', prisma.materialCategory.deleteMany({ where: { createdBy: { in: ids } } }));
  await del('expenses', prisma.expense.deleteMany({
    where: { OR: [
      { createdBy: { in: ids } },
      { paidByUserId: { in: ids } },
      { shiftId: { in: smokeShiftIds } },
    ] },
  }));
  await del('dailyClosings', prisma.dailyClosing.deleteMany({
    where: { OR: [
      { closedBy: { in: ids } },
      { reopenedBy: { in: ids } },
    ] },
  }));
  await del('handovers', prisma.cashHandover.deleteMany({
    where: { OR: [
      { fromUserId: { in: ids } },
      { toUserId: { in: ids } },
      { createdById: { in: ids } },
      { shiftId: { in: smokeShiftIds } },
    ] },
  }));
  await del('reconciliations', prisma.reconciliation.deleteMany({
    where: { OR: [
      { userId: { in: ids } },
      { createdBy: { in: ids } },
      { shiftId: { in: smokeShiftIds } },
    ] },
  }));
  await del('collections', prisma.collection.deleteMany({
    where: { OR: [
      { userId: { in: ids } },
      { createdById: { in: ids } },
      { shiftId: { in: smokeShiftIds } },
    ] },
  }));
  await del('shifts', prisma.shift.deleteMany({ where: { userId: { in: ids } } }));
  await del('sessions', prisma.session.deleteMany({ where: { userId: { in: ids } } }));
  await del('users', prisma.user.deleteMany({ where: { id: { in: ids } } }));

  console.log('done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
