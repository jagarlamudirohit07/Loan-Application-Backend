import express from 'express';
import { createLoanOffer, getUserLoans, acceptLoanOffer } from '../controllers/loan.controller';
import { protect, authorize } from '../middlewares/auth';

const router = express.Router();

// Lender routes
router.post('/', protect, authorize('BORROWER'), createLoanOffer);

// Borrower routes
router.get('/user', protect, authorize('BORROWER'), getUserLoans);
router.get('/borrower-loans', protect, authorize('LENDER'), getUserLoans);
router.put('/:id/accept', protect, authorize('LENDER'), acceptLoanOffer);

export default router;
