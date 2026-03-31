import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../middlewares/auth';
import { updateLoanStatusAfterEmiPayment } from '../services/loanStatus.service';

// @desc    Pay a single EMI
// @route   POST /api/emis/:id/pay
// @access  Borrower
export const payEmi = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const emiId = req.params.id;

    const emi = await prisma.emi.findUnique({
      where: { id: emiId },
      include: { loan: true }
    });

    if (!emi) {
      res.status(404).json({ message: 'EMI record not found' });
      return;
    }

    if (emi.userId !== req.user.id) {
      res.status(403).json({ message: 'Not authorized for this EMI' });
      return;
    }

    if (emi.status === 'PAID') {
      res.status(400).json({ message: 'EMI is already paid' });
      return;
    }

    if (emi.status === 'CLOSED') {
      res.status(400).json({ message: 'EMI is closed (loan preclosed or fully paid)' });
      return;
    }

    // Block payments on completed loans
    if (emi.loan.status === 'PAID' || emi.loan.status === 'PRECLOSURE') {
      res.status(403).json({ message: 'Loan is already closed. No further EMI payments allowed.' });
      return;
    }

    // Update EMI status to PAID
    const updatedEmi = await prisma.emi.update({
      where: { id: emi.id },
      data: {
        status: 'PAID',
        paidAt: new Date()
      }
    });

    // Auto-update loan status based on remaining EMIs
    await updateLoanStatusAfterEmiPayment(emi.loanId);

    // Fetch updated loan for response
    const updatedLoan = await prisma.loan.findUnique({
      where: { id: emi.loanId },
      select: { status: true, remainingBalance: true }
    });

    res.json({
      message: 'EMI paid successfully',
      emi: updatedEmi,
      loanStatus: updatedLoan?.status,
      remainingBalance: updatedLoan?.remainingBalance
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
