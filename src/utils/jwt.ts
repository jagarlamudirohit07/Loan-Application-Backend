import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'loan_app_super_secret_key';

export const generateToken = (userId: string, role: string): string => {
  return jwt.sign({ id: userId, role }, JWT_SECRET, {
    expiresIn: '30d',
  });
};

export const verifyToken = (token: string): any => {
  return jwt.verify(token, JWT_SECRET);
};
