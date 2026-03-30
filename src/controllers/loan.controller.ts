import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../middlewares/auth';
import { calculateEMI } from '../services/emiCalculator';


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
        lenderId: req.user.id, // ✅ assign lender at creation
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


// ✅ LENDER APPROVES LOAN
export const acceptLoanOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loanId = req.params.id;

    // ✅ Only lender can approve
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

    // ✅ Ensure lender owns this loan
    if (loan.lenderId !== req.user.id) {
      res.status(403).json({ message: 'Not authorized for this loan' });
      return;
    }

    if (loan.status !== 'PENDING') {
      res.status(400).json({ message: 'Loan already processed' });
      return;
    }

    // ✅ EMI calculation
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
        userId: loan.borrowerId, // ✅ borrower pays EMI
        amount: emiAmount,
        dueDate,
        status: 'UNPAID',
      });
    }

    // ✅ Transaction
    await prisma.$transaction(async (tx) => {
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: 'ACTIVE',
        },
      });

      for (const emi of emis) {
        await tx.emi.create({ data: emi });
      }
    });

    res.json({ message: 'Loan approved and EMIs generated' });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ OPTIONAL: LENDER REJECT LOAN
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
export const getBorrowers = async (req: AuthRequest, res: Response) => {
  const borrowers = await prisma.user.findMany({
    where: { role: 'BORROWER' },
    select: { id: true, name: true, email: true },
  });

  res.json(borrowers);
};