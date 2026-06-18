import { PrismaAdapter } from '@auth/prisma-adapter';
import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { db } from './db';
import * as bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { isSingleSessionEnabled } from './auth-config';

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
    async jwt({ token, user, account, profile, trigger, session }) {
      if (!isSingleSessionEnabled()) {
        // Lógica estándar sin validación de sesión única
        if (user) {
          token.id = user.id;
          token.role = (user as any).role ?? 'STUDENT';
          token.emailVerified = (user as any).emailVerified ?? null;
          token.image = (user as any).image ?? null;
        }
        if (account?.provider === 'google' && (profile as any)?.email_verified === true) {
          const verifiedDate = new Date();
          token.emailVerified = verifiedDate;
          if (user?.id) {
            await db.user.update({
              where: { id: user.id },
              data: { emailVerified: verifiedDate },
            }).catch(() => {});
          }
        }
        if (trigger === 'update' && session) {
          if (session.name) token.name = session.name;
          if (session.image !== undefined) token.image = session.image;
        }
        return token;
      }

      // Si ya hay un error previo registrado en el token, no procesar nada más
      if (token.error) {
        return token;
      }

      // Al hacer login, poblar token con datos del usuario y generar nueva sesión única
      if (user) {
        token.id = user.id;
        token.role = (user as any).role ?? 'STUDENT';
        token.emailVerified = (user as any).emailVerified ?? null;
        token.image = (user as any).image ?? null;

        const newSessionId = crypto.randomUUID();
        token.activeSessionId = newSessionId;

        // Intentar obtener IP y User Agent
        let userAgent: string | null = null;
        let ip: string | null = null;
        try {
          const reqHeaders = await headers();
          userAgent = reqHeaders.get('user-agent') || null;
          ip = reqHeaders.get('x-forwarded-for')?.split(',')[0].trim() || reqHeaders.get('x-real-ip') || null;
        } catch (e) {
          // headers() puede fallar en entornos no-HTTP (ej: scripts, builds)
        }

        // Registrar nuevo activeSessionId e info de login en la DB
        try {
          await db.user.update({
            where: { id: user.id },
            data: {
              activeSessionId: newSessionId,
              lastLoginAt: new Date(),
              lastLoginIp: ip,
              lastLoginUserAgent: userAgent,
            },
          });
        } catch (e) {
          console.error('Error al actualizar datos de sesión en login:', e);
        }
      } else if (token.id) {
        // En peticiones posteriores, validar que el activeSessionId del token coincida con la DB
        try {
          const dbUser = await db.user.findUnique({
            where: { id: token.id },
            select: { activeSessionId: true },
          });

          if (!dbUser || dbUser.activeSessionId !== token.activeSessionId) {
            token.error = 'SessionExpired';
          }
        } catch (e) {
          console.error('Error al validar sesión contra la base de datos:', e);
          // Si la base de datos falla temporalmente, permitimos continuar
        }
      }

      // Google login: el adapter ya creó/vinculó el usuario cuando llega aquí.
      if (account?.provider === 'google' && (profile as any)?.email_verified === true) {
        const verifiedDate = new Date();
        token.emailVerified = verifiedDate;
        if (user?.id) {
          await db.user.update({
            where: { id: user.id },
            data: { emailVerified: verifiedDate },
          }).catch(() => {
            // No bloquear si por alguna razón falla
          });
        }
      }

      // Al hacer update de sesión (ej: desde perfil), refrescar datos
      if (trigger === 'update' && session) {
        if (session.name) token.name = session.name;
        if (session.image !== undefined) token.image = session.image;
      }

      return token;
    },
    async session({ session, token }) {
      if (!isSingleSessionEnabled()) {
        // Lógica estándar sin validación de sesión única
        if (token && session.user) {
          session.user.id = token.id as string;
          session.user.role = token.role as any;
          session.user.emailVerified = token.emailVerified as Date | null;
          session.user.image = (token.image as string | null) ?? session.user.image;
        }
        return session;
      }

      if (token.error) {
        session.error = token.error;
        if (session.user) {
          session.user.id = '';
          session.user.role = 'STUDENT';
          session.user.emailVerified = null;
          session.user.activeSessionId = null;
        }
        return session;
      }

      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as any;
        session.user.emailVerified = token.emailVerified as Date | null;
        session.user.image = (token.image as string | null) ?? session.user.image;
        session.user.activeSessionId = token.activeSessionId as string | null;
      }
      return session;
    },
    async signIn({ account, profile }) {
      // Google: solo validar que el email esté verificado por Google.
      // La creación/vinculación del usuario la maneja el PrismaAdapter.
      // El update de emailVerified en DB lo hace el callback jwt (cuando el
      // adapter ya terminó su flujo y user.id está disponible).
      if (account?.provider === 'google') {
        const isVerified = (profile as any)?.email_verified === true;
        return isVerified; // false bloquea el login
      }

      return true;
    },

  },
  secret: process.env.NEXTAUTH_SECRET,
};
