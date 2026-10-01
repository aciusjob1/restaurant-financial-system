import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        fullName: string;
        role: Role;
        isActive: boolean;
        phone: string | null;
        language: string | null;
        autoApproveExpenses: boolean;
        autoReviewReconciliations: boolean;
        autoConfirmHandovers: boolean;
      };
      sessionToken?: string;
    }
  }
}

export {};