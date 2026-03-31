import express from 'express';
import {
  createLoanOffer,
  getUserLoans,
  acceptLoanOffer,
  getLenderLoans,
  rejectLoanOffer,
  getBorrowers,
  getLoanDetails,
  markLoanPaid,
  precloseLoanController
} from '../controllers/loan.controller';

import { protect, authorize } from '../middlewares/auth';

const router = express.Router();


// ✅ LENDER ROUTES

// Create loan offer
router.post('/', protect, authorize('LENDER'), createLoanOffer);

// Get all loans created by lender
router.get('/lender', protect, authorize('LENDER'), getLenderLoans);

// Get all borrowers (for lender to select)
router.get('/borrowers', protect, authorize('LENDER'), getBorrowers);

// Approve loan
router.put('/:id/accept', protect, authorize('LENDER'), acceptLoanOffer);

// Reject loan
router.put('/:id/reject', protect, authorize('LENDER'), rejectLoanOffer);

// Mark loan as fully paid (lender action)
router.put('/:id/pay-full', protect, authorize('LENDER'), markLoanPaid);


// ✅ BORROWER ROUTES

// Get borrower's own loans
router.get('/user', protect, authorize('BORROWER'), getUserLoans);


// ✅ SHARED ROUTES (both borrower and lender)

// Get single loan details with EMIs
router.get('/:id', protect, getLoanDetails);

// Preclosure (borrower or lender can initiate)
router.put('/:id/preclose', protect, precloseLoanController);


export default router;