import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../middlewares/auth';

// @desc    Simulate EMI payment
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

    // Update EMI Status
    const updatedEmi = await prisma.emi.update({
      where: { id: emi.id },
      data: {
        status: 'PAID',
        paidAt: new Date()
      }
    });

    // Optional: check if all EMIs are paid to close the loan
    const remainingEmis = await prisma.emi.count({
      where: {
        loanId: emi.loanId,
        status: 'UNPAID'
      }
    });

    if (remainingEmis === 0) {
      await prisma.loan.update({
        where: { id: emi.loanId },
        data: { status: 'CLOSED' }
      });
    }

    res.json({ message: 'EMI paid successfully', emi: updatedEmi });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
