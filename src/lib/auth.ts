import { PrismaAdapter } from '@auth/prisma-adapter';
import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { db } from './db';
import * as bcrypt from 'bcryptjs';

export const authOptions: AuthOptions = {
  // @ts-expect-error - PrismaAdapter type mismatch entre @auth/prisma-adapter y next-auth v4
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      allowDangerousEmailAccountLinking: true, // Vincula Google con cuenta existente por email
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          emailVerified: profile.email_verified ? new Date() : null,
          role: 'STUDENT',
        };
      },
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Ingresá tu email y contraseña.');
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error('No existe una cuenta registrada con este email.');
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (!isPasswordValid) {
          throw new Error('La contraseña es incorrecta.');
        }

        if (!user.emailVerified) {
          // Señal especial para que el cliente pueda ofrecer reenvío de confirmación
          throw new Error('EMAIL_NOT_VERIFIED');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Al hacer login, poblar token con datos del usuario
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.emailVerified = (user as any).emailVerified ?? null;
        token.image = (user as any).image ?? null;
      }

      // Al hacer update de sesión (ej: desde perfil), refrescar datos
      if (trigger === 'update' && session) {
        if (session.name) token.name = session.name;
        if (session.image !== undefined) token.image = session.image;
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as any;
        session.user.emailVerified = token.emailVerified as Date | null;
        session.user.image = (token.image as string | null) ?? session.user.image;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // Usuarios de Google: marcar emailVerified si Google lo devuelve verificado
      if (account?.provider === 'google') {
        const isVerified = (profile as any)?.email_verified === true;
        if (!isVerified) {
          return false; // Bloquear si Google no certifica que el email está verificado
        }

        if (user.email) {
          await db.user.update({
            where: { email: user.email },
            data: {
              emailVerified: new Date(),
              image: (user as any).image || undefined,
            },
          }).catch(() => {
            // El usuario puede no existir todavía si es registro nuevo, PrismaAdapter lo crea
          });
        }
        return true;
      }

      return true;
    },

  },
  secret: process.env.NEXTAUTH_SECRET,
};
