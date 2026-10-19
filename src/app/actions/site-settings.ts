'use server';

import { db } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth-helpers';
import { revalidatePath } from 'next/cache';

const PROMO_BANNER_KEY = 'promoBannerEnabled';

/**
 * Obtiene el estado del banner promocional.
 * Por defecto devuelve true si aún no se configuró explícitamente.
 */
export async function getPromoBannerStatus(): Promise<boolean> {
  try {
    if ((db as any).siteSetting?.findUnique) {
      const setting = await (db as any).siteSetting.findUnique({
        where: { key: PROMO_BANNER_KEY },
      });
      if (!setting) return true;
      return setting.value === 'true';
    }

    const rows: any = await db.$queryRaw`SELECT value FROM "SiteSetting" WHERE key = ${PROMO_BANNER_KEY} LIMIT 1`;
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0].value === 'true';
    }
    return true;
  } catch (error) {
    console.error('Error al obtener estado del banner promocional:', error);
    return true;
  }
}

/**
 * Activa o desactiva el banner promocional (solo para administradores).
 */
export async function togglePromoBannerAction(enabled: boolean): Promise<{ success: boolean; enabled: boolean; error?: string }> {
  try {
    await requireAdminSession();

    if ((db as any).siteSetting?.upsert) {
      await (db as any).siteSetting.upsert({
        where: { key: PROMO_BANNER_KEY },
        update: { value: String(enabled) },
        create: { key: PROMO_BANNER_KEY, value: String(enabled) },
      });
    } else {
      await db.$executeRaw`
        INSERT INTO "SiteSetting" ("key", "value", "updatedAt")
        VALUES (${PROMO_BANNER_KEY}, ${String(enabled)}, CURRENT_TIMESTAMP)
        ON CONFLICT ("key") DO UPDATE SET "value" = ${String(enabled)}, "updatedAt" = CURRENT_TIMESTAMP
      `;
    }

    revalidatePath('/', 'layout');
    revalidatePath('/admin/courses');

    return { success: true, enabled };
  } catch (error: any) {
    console.error('Error al actualizar banner promocional:', error);
    return { success: false, enabled: !enabled, error: error.message || 'No se pudo actualizar el banner' };
  }
}
