import { Role } from '@prisma/client';
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    error?: string;
    user: {
      id: string;
      role: Role;
      emailVerified: Date | null;
      activeSessionId?: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: Role;
    emailVerified?: Date | null;
    activeSessionId?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    emailVerified: Date | null;
    image?: string | null;
    activeSessionId?: string | null;
    error?: string;
  }
}
