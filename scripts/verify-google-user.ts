/**
 * Uso: npx tsx scripts/verify-google-user.ts <email>
 * Verifica el estado en DB de un usuario tras login con Google.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const email = process.argv[2];

async function main() {
  if (!email) {
    console.error('Uso: npx tsx scripts/verify-google-user.ts <email>');
    process.exit(1);
  }

  const user = await db.user.findUnique({
    where: { email },
    include: { accounts: true, sessions: true },
  });

  if (!user) {
    console.error('❌ Usuario NO encontrado en DB:', email);
    process.exit(1);
  }

  const googleAccounts = user.accounts.filter((a) => a.provider === 'google');
  const otherAccounts  = user.accounts.filter((a) => a.provider !== 'google');

  console.log('\n=== RESULTADO DEL TEST ===\n');
  console.log(`Email:          ${user.email}`);
  console.log(`User.id:        ${user.id}`);
  console.log(`emailVerified:  ${user.emailVerified ?? '❌ NULL — PROBLEMA'}`);
  console.log(`role:           ${user.role}`);
  console.log(`Accounts total: ${user.accounts.length} (Google: ${googleAccounts.length}, otros: ${otherAccounts.length})`);
  console.log(`Sessions:       ${user.sessions.length}`);

  console.log('\n=== ACCOUNTS ===');
  for (const acc of user.accounts) {
    const idMatch = acc.userId === user.id;
    console.log(`  provider: ${acc.provider} | userId: ${acc.userId} | id match: ${idMatch ? '✅' : '❌ MISMATCH'}`);
  }

  console.log('\n=== DIAGNÓSTICO ===');
  const issues: string[] = [];
  if (!user.emailVerified)                    issues.push('❌ emailVerified es NULL');
  if (googleAccounts.length === 0)            issues.push('❌ No hay Account de Google');
  if (googleAccounts.length > 1)              issues.push(`❌ Hay ${googleAccounts.length} Accounts de Google (duplicados)`);
  if (googleAccounts.some((a) => a.userId !== user.id)) issues.push('❌ Account.userId no coincide con User.id');

  // Buscar duplicados de email
  const allUsers = await db.user.findMany({ where: { email } });
  if (allUsers.length > 1) issues.push(`❌ HAY ${allUsers.length} Users con el mismo email (duplicados)`);

  if (issues.length === 0) {
    console.log('✅ Todo OK — el fix funciona correctamente.\n');
  } else {
    console.log(issues.join('\n'));
    console.log('');
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
