import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../middlewares/auth';
import { calculateEMI } from '../services/emiCalculator';

// @desc    Create a new loan offer
// @route   POST /api/loans
// @access  Lender (Admin)
export const createLoanOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { borrowerId, principalAmount, interestRate, tenureMonths, processingFee, gstDeduction, preClosureChg } = req.body;

    const borrower = await prisma.user.findUnique({ where: { id: borrowerId } });
    if (!borrower || borrower.role !== 'BORROWER') {
      res.status(404).json({ message: 'Borrower not found or invalid user role' });
      return;
    }

    const loan = await prisma.loan.create({
      data: {
        borrowerId,
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

// @desc    Get all loans for logged in user (Borrower)
// @route   GET /api/loans/user
// @access  Borrower
export const getUserLoans = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loans = await prisma.loan.findMany({
      where: { borrowerId: req.user.id },
      include: { emis: true },
    });
    res.json(loans);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Accept Loan Offer
// @route   PUT /api/loans/:id/accept
// @access  Borrower
export const acceptLoanOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loanId = req.params.id;
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });

    if (!loan) {
      res.status(404).json({ message: 'Loan not found' });
      return;
    }

    if (loan.borrowerId !== req.user.id) {
       res.status(403).json({ message: 'Not authorized for this loan' });
       return;
    }

    if (loan.status !== 'PENDING') {
      res.status(400).json({ message: 'Loan offer already processed' });
      return;
    }

    // EMI Calculation
    const emiAmount = calculateEMI(loan.principalAmount, loan.interestRate, loan.tenureMonths);

    // Create EMIs
    const emis = [];
    const currentDate = new Date();
    
    for (let i = 1; i <= loan.tenureMonths; i++) {
       const dueDate = new Date(currentDate);
       dueDate.setMonth(currentDate.getMonth() + i);

       emis.push({
         loanId: loan.id,
         userId: req.user.id,
         amount: emiAmount,
         dueDate,
         status: 'UNPAID', // Fix TS issue below by utilizing implicit casting or matching type
       });
    }

    // Perform transaction to update loan status and create EMIs
    await prisma.$transaction(async (prismaCli) => {
       await prismaCli.loan.update({
         where: { id: loan.id },
         data: { status: 'ACTIVE' }
       });
       
       // Note: createMany might complain with MongoDB, using standard loop if issues, 
       // but typically Prisma supports createMany for MongoDB now if not using relations directly in it
       for(const emi of emis){
          await prismaCli.emi.create({ data: {
             loanId: emi.loanId,
             userId: emi.userId,
             amount: emi.amount,
             dueDate: emi.dueDate,
             status: 'UNPAID'
          } });
       }
    });

    res.json({ message: 'Loan accepted and EMIs generated' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
