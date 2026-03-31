import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../middlewares/auth';
import { calculateEMI } from '../services/emiCalculator';
import {
  markLoanAsPaid as markLoanAsPaidService,
  precloseLoan as precloseLoanService,
  calculateRemainingBalance,
} from '../services/loanStatus.service';


// ✅ CREATE LOAN OFFER (LENDER)
export const createLoanOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user.role !== 'LENDER') {
      res.status(403).json({ message: 'Only lenders can create loan offers' });
      return;
    }

    const {
      borrowerId,
      principalAmount,
      interestRate,
      tenureMonths,
      processingFee,
      gstDeduction,
      preClosureChg
    } = req.body;

    const borrower = await prisma.user.findUnique({
      where: { id: borrowerId }
    });

    if (!borrower || borrower.role !== 'BORROWER') {
      res.status(404).json({ message: 'Borrower not found or invalid role' });
      return;
    }

    const loan = await prisma.loan.create({
      data: {
        borrowerId,
        lenderId: req.user.id,
        principalAmount,
        interestRate,
        tenureMonths,
        processingFee,
        gstDeduction,
        preClosureChg,
        status: 'PENDING',
      },
    });

    res.status(201).json(loan);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ GET LOANS FOR BORROWER
export const getUserLoans = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user.role !== 'BORROWER') {
      res.status(403).json({ message: 'Only borrowers can view their loans' });
      return;
    }

    const loans = await prisma.loan.findMany({
      where: { borrowerId: req.user.id },
      include: { emis: true },
    });

    res.json(loans);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ GET LOANS FOR LENDER
export const getLenderLoans = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user.role !== 'LENDER') {
      res.status(403).json({ message: 'Only lenders can view loans' });
      return;
    }

    const loans = await prisma.loan.findMany({
      where: { lenderId: req.user.id },
      include: { emis: true },
    });

    res.json(loans);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ GET SINGLE LOAN DETAILS WITH EMIs
export const getLoanDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loanId = req.params.id;

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        emis: { orderBy: { dueDate: 'asc' } },
        borrower: { select: { id: true, name: true, email: true } },
        lender: { select: { id: true, name: true, email: true } },
      },
    });

    if (!loan) {
      res.status(404).json({ message: 'Loan not found' });
      return;
    }

    // Ensure user is either the borrower or the lender
    if (loan.borrowerId !== req.user.id && loan.lenderId !== req.user.id) {
      res.status(403).json({ message: 'Not authorized to view this loan' });
      return;
    }

    // Calculate live remaining balance
    const remainingBalance = await calculateRemainingBalance(loanId);

    const paidEmis = loan.emis.filter((e) => e.status === 'PAID').length;
    const unpaidEmis = loan.emis.filter((e) => e.status === 'UNPAID' || e.status === 'LATE').length;
    const closedEmis = loan.emis.filter((e) => e.status === 'CLOSED').length;

    res.json({
      ...loan,
      remainingBalance,
      emiSummary: {
        total: loan.emis.length,
        paid: paidEmis,
        unpaid: unpaidEmis,
        closed: closedEmis,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ LENDER APPROVES LOAN
export const acceptLoanOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loanId = req.params.id;

    if (req.user.role !== 'LENDER') {
      res.status(403).json({ message: 'Only lenders can approve loans' });
      return;
    }

    const loan = await prisma.loan.findUnique({
      where: { id: loanId }
    });

    if (!loan) {
      res.status(404).json({ message: 'Loan not found' });
      return;
    }

    if (loan.lenderId !== req.user.id) {
      res.status(403).json({ message: 'Not authorized for this loan' });
      return;
    }

    if (loan.status !== 'PENDING') {
      res.status(400).json({ message: 'Loan already processed' });
      return;
    }

    // EMI calculation
    const emiAmount = calculateEMI(
      loan.principalAmount,
      loan.interestRate,
      loan.tenureMonths
    );

    const emis: any[] = [];
    const currentDate = new Date();

    for (let i = 1; i <= loan.tenureMonths; i++) {
      const dueDate = new Date(currentDate);
      dueDate.setMonth(currentDate.getMonth() + i);

      emis.push({
        loanId: loan.id,
        userId: loan.borrowerId,
        amount: emiAmount,
        dueDate,
        status: 'UNPAID',
      });
    }

    // Total remaining balance = sum of all EMIs
    const totalRemainingBalance = parseFloat((emiAmount * loan.tenureMonths).toFixed(2));

    // Transaction: update loan status + create EMIs
    await prisma.$transaction(async (tx) => {
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: 'ACTIVE',
          remainingBalance: totalRemainingBalance,
        },
      });

      await tx.emi.createMany({ data: emis });
    });

    res.json({
      message: 'Loan approved and EMIs generated',
      emiAmount: parseFloat(emiAmount.toFixed(2)),
      totalEmis: loan.tenureMonths,
      remainingBalance: totalRemainingBalance,
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ LENDER REJECTS LOAN
export const rejectLoanOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loanId = req.params.id;

    if (req.user.role !== 'LENDER') {
      res.status(403).json({ message: 'Only lenders can reject loans' });
      return;
    }

    const loan = await prisma.loan.findUnique({
      where: { id: loanId }
    });

    if (!loan) {
      res.status(404).json({ message: 'Loan not found' });
      return;
    }

    if (loan.lenderId !== req.user.id) {
      res.status(403).json({ message: 'Not authorized' });
      return;
    }

    if (loan.status !== 'PENDING') {
      res.status(400).json({ message: 'Loan already processed' });
      return;
    }

    await prisma.loan.update({
      where: { id: loanId },
      data: { status: 'REJECTED' }
    });

    res.json({ message: 'Loan rejected successfully' });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ MARK LOAN AS FULLY PAID (LENDER)
export const markLoanPaid = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loanId = req.params.id;

    // Verify lender owns this loan
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) {
      res.status(404).json({ message: 'Loan not found' });
      return;
    }

    if (loan.lenderId !== req.user.id) {
      res.status(403).json({ message: 'Not authorized for this loan' });
      return;
    }

    const updatedLoan = await markLoanAsPaidService(loanId);

    res.json({
      message: 'Loan marked as fully paid. All EMIs cleared.',
      loan: updatedLoan,
    });
  } catch (error: any) {
    const statusCode = error.message.includes('Cannot mark') ? 400 : 500;
    res.status(statusCode).json({ message: error.message });
  }
};


// ✅ PRECLOSURE (BORROWER or LENDER)
export const precloseLoanController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loanId = req.params.id;

    // Verify user is borrower or lender of this loan
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) {
      res.status(404).json({ message: 'Loan not found' });
      return;
    }

    if (loan.borrowerId !== req.user.id && loan.lenderId !== req.user.id) {
      res.status(403).json({ message: 'Not authorized for this loan' });
      return;
    }

    const settlement = await precloseLoanService(loanId);

    res.json({
      message: 'Loan preclosed successfully',
      settlement,
    });
  } catch (error: any) {
    const statusCode = error.message.includes('Cannot preclose') ? 400 : 500;
    res.status(statusCode).json({ message: error.message });
  }
};


// ✅ GET ALL BORROWERS (LENDER utility)
export const getBorrowers = async (req: AuthRequest, res: Response) => {
  const borrowers = await prisma.user.findMany({
    where: { role: 'BORROWER' },
    select: { id: true, name: true, email: true },
  });

  res.json(borrowers);
};