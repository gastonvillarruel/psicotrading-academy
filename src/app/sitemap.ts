import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.psicoemotrading.com";

  const defaultPaths = [
    { path: "", changeFrequency: "weekly" as const, priority: 1.0 },
    { path: "/quienes-somos", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/campus/curso-scalping-en-vivo", changeFrequency: "weekly" as const, priority: 0.8 },
    { path: "/evaluacion/escala-tu-cuenta-sin-miedo", changeFrequency: "weekly" as const, priority: 0.8 },
    { path: "/campus/trader-impulsivo-trader-consistente", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/campus/penta-trade", changeFrequency: "monthly" as const, priority: 0.7 },
  ];

  const now = new Date();
  const seenPaths = new Set(defaultPaths.map((item) => item.path));

  let extraCourses: MetadataRoute.Sitemap = [];
  try {
    const courses = await db.course.findMany({
      where: { available: true },
      select: { slug: true, createdAt: true },
    });

    extraCourses = courses
      .filter((c) => !seenPaths.has(`/campus/${c.slug}`))
      .map((c) => ({
        url: `${baseUrl}/campus/${c.slug}`,
        lastModified: c.createdAt || now,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
  } catch (e) {
    // En caso de no poder acceder a la base en compilación, se usan las rutas base auditadas
  }

  return [
    ...defaultPaths.map((item) => ({
      url: `${baseUrl}${item.path}`,
      lastModified: now,
      changeFrequency: item.changeFrequency,
      priority: item.priority,
    })),
    ...extraCourses,
  ];
}
