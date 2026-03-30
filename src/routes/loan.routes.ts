import express from 'express';
import {
  createLoanOffer,
  getUserLoans,
  acceptLoanOffer,
  getLenderLoans,
  rejectLoanOffer,
  getBorrowers
} from '../controllers/loan.controller';

import { protect, authorize } from '../middlewares/auth';

const router = express.Router();


// ✅ LENDER ROUTES

// Create loan offer
router.post('/', protect, authorize('LENDER'), createLoanOffer);

// Get all loans created by lender
router.get('/lender', protect, authorize('LENDER'), getLenderLoans);

router.get('/borrowers', protect, authorize('LENDER'), getBorrowers);

// Approve loan
router.put('/:id/accept', protect, authorize('LENDER'), acceptLoanOffer);

// Reject loan (optional but recommended)
router.put('/:id/reject', protect, authorize('LENDER'), rejectLoanOffer);



// ✅ BORROWER ROUTES

// Get borrower’s own loans
router.get('/user', protect, authorize('BORROWER'), getUserLoans);


export default router;