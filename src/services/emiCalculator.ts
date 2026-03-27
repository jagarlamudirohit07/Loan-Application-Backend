export const calculateEMI = (
  principal: number,
  annualInterestRate: number,
  tenureMonths: number
): number => {
  // R = Monthly Interest Rate (Annual Rate / 12 / 100)
  const r = annualInterestRate / 12 / 100;
  
  if (r === 0) {
    return principal / tenureMonths;
  }

  // EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
  const emi = 
    (principal * r * Math.pow(1 + r, tenureMonths)) /
    (Math.pow(1 + r, tenureMonths) - 1);
    
  return emi;
};
