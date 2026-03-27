import express from 'express';
import { payEmi } from '../controllers/emi.controller';
import { protect, authorize } from '../middlewares/auth';

const router = express.Router();

// Borrower pays EMI
router.post('/:id/pay', protect, authorize('BORROWER'), payEmi);

export default router;
