import prisma from '../config/db';

/**
 * Recalculate remaining balance from UNPAID EMIs and update loan status.
 * Called after every individual EMI payment.
 */
export const updateLoanStatusAfterEmiPayment = async (loanId: string) => {
  const unpaidEmis = await prisma.emi.findMany({
    where: { loanId, status: 'UNPAID' },
  });

  const remainingBalance = unpaidEmis.reduce((sum, emi) => sum + emi.amount, 0);

  if (unpaidEmis.length === 0) {
    // All EMIs paid → mark loan as PAID
    await prisma.loan.update({
      where: { id: loanId },
      data: {
        status: 'PAID',
        remainingBalance: 0,
      },
    });
  } else {
    // EMIs still pending → mark loan as UNPAID
    await prisma.loan.update({
      where: { id: loanId },
      data: {
        status: 'UNPAID',
        remainingBalance,
      },
    });
  }
};

/**
 * Mark a loan as fully paid:
 * - Validates loan is ACTIVE or UNPAID
 * - Marks all remaining UNPAID EMIs as PAID
 * - Sets remainingBalance to 0
 * - Updates loan status to PAID
 */
export const markLoanAsPaid = async (loanId: string) => {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { emis: true },
  });

  if (!loan) {
    throw new Error('Loan not found');
  }

  if (loan.status !== 'ACTIVE' && loan.status !== 'UNPAID') {
    throw new Error(
      `Cannot mark loan as paid. Current status is "${loan.status}". Only ACTIVE or UNPAID loans can be marked as paid.`
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Mark all unpaid EMIs as PAID
    await tx.emi.updateMany({
      where: {
        loanId: loan.id,
        status: { in: ['UNPAID', 'LATE'] },
      },
      data: {
        status: 'PAID',
        paidAt: now,
      },
    });

    // Update loan status
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        status: 'PAID',
        remainingBalance: 0,
      },
    });
  });

  // Return updated loan
  return prisma.loan.findUnique({
    where: { id: loanId },
    include: { emis: true },
  });
};

/**
 * Preclosure — close a loan before tenure ends:
 * - Validates loan is ACTIVE or UNPAID
 * - Calculates remaining principal from UNPAID EMIs
 * - Applies preclosure charge (preClosureChg% of remaining principal)
 * - Marks all remaining UNPAID EMIs as CLOSED
 * - Updates loan with preclosure info
 *
 * Returns a settlement summary.
 */
export const precloseLoan = async (loanId: string) => {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { emis: true },
  });

  if (!loan) {
    throw new Error('Loan not found');
  }

  if (loan.status !== 'ACTIVE' && loan.status !== 'UNPAID') {
    throw new Error(
      `Cannot preclose loan. Current status is "${loan.status}". Only ACTIVE or UNPAID loans can be preclosed.`
    );
  }

  // Calculate remaining principal from unpaid EMIs
  const unpaidEmis = loan.emis.filter(
    (emi) => emi.status === 'UNPAID' || emi.status === 'LATE'
  );
  const remainingPrincipal = unpaidEmis.reduce(
    (sum, emi) => sum + emi.amount,
    0
  );

  // Calculate paid vs total for interest breakdown
  const paidEmis = loan.emis.filter((emi) => emi.status === 'PAID');
  const totalPaid = paidEmis.reduce((sum, emi) => sum + emi.amount, 0);

  // Preclosure charge: preClosureChg% of remaining principal (default 2%)
  const preclosureRate = loan.preClosureChg || 2;
  const preclosureCharges = parseFloat(
    ((remainingPrincipal * preclosureRate) / 100).toFixed(2)
  );

  const totalSettlement = parseFloat(
    (remainingPrincipal + preclosureCharges).toFixed(2)
  );

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Mark all remaining EMIs as CLOSED
    await tx.emi.updateMany({
      where: {
        loanId: loan.id,
        status: { in: ['UNPAID', 'LATE'] },
      },
      data: {
        status: 'CLOSED',
      },
    });

    // Update loan
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        status: 'PRECLOSURE',
        remainingBalance: 0,
        preclosureCharges,
        preclosureDate: now,
      },
    });
  });

  return {
    loanId: loan.id,
    originalPrincipal: loan.principalAmount,
    totalEmisPaid: paidEmis.length,
    totalEmisRemaining: unpaidEmis.length,
    totalAmountPaid: parseFloat(totalPaid.toFixed(2)),
    remainingPrincipal: parseFloat(remainingPrincipal.toFixed(2)),
    preclosureRate,
    preclosureCharges,
    totalSettlementAmount: totalSettlement,
    preclosureDate: now,
    status: 'PRECLOSURE',
  };
};

/**
 * Utility: calculate remaining balance from UNPAID EMIs for a loan.
 */
export const calculateRemainingBalance = async (
  loanId: string
): Promise<number> => {
  const unpaidEmis = await prisma.emi.findMany({
    where: { loanId, status: { in: ['UNPAID', 'LATE'] } },
  });

  return unpaidEmis.reduce((sum, emi) => sum + emi.amount, 0);
};
