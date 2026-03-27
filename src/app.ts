import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middlewares/error';
import authRoutes from './routes/auth.routes';
import loanRoutes from './routes/loan.routes';
import emiRoutes from './routes/emi.routes';

dotenv.config();

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/emis', emiRoutes);

// Health check
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Loan App API is running' });
});

// Error handling
app.use(errorHandler);

export default app;
