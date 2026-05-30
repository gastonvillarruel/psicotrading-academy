import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { formatCoursePrice, getDefaultCurrency } from '@/lib/price';

async function getFeaturedCourses() {
  try {
    const courses = await db.course.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
    });
    return courses;
  } catch (error) {
    console.error('Error al cargar cursos destacados en Landing:', error);
    return [];
  }
}

export default async function LandingPage() {
  const courses = await getFeaturedCourses();

  return (
    <main className="w-full bg-brand-bg text-brand-text overflow-hidden">
      {/* Hero Section */}
      <section className="relative pt-16 pb-20 md:pt-24 md:pb-32 bg-gradient-to-b from-brand-bg-sec/40 to-brand-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 flex flex-col justify-center animate-fade-in-up">
              <span className="text-sm font-bold tracking-widest text-brand-secondary uppercase mb-3">
                Entrenamiento Psicológico de Trading
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-brand-text leading-[1.1] mb-6">
                Dominá tus emociones antes de operar el mercado.
              </h1>
              
              <div className="border-l-2 border-brand-accent/50 pl-4 mb-8">
                <p className="text-lg md:text-xl text-brand-text-muted leading-relaxed font-normal">
                  PSICOEMOTRADING es una academia de entrenamiento mental para traders que quieren dejar de operar desde el impulso, la ansiedad y la revancha, y empezar a construir disciplina, método y consistencia.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 animation-delay-150 animate-fade-in-up">
                <Link
                  href="/campus"
                  className="px-8 py-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg text-center shadow-md shadow-brand-primary/10 hover:shadow-brand-primary/20 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
                >
                  Entrenar mi mente como trader
                </Link>
                <a
                  href="#metodo"
                  className="px-8 py-4 bg-transparent hover:bg-brand-bg-sec text-brand-text border border-brand-border hover:border-brand-text/30 font-semibold rounded-lg text-center hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
                >
                  Ver cómo funciona el método
                </a>
              </div>
            </div>

            {/* Right Image Frame */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end animate-fade-in animation-delay-300">
              <div className="relative w-full max-w-sm sm:max-w-md">
                {/* Background decorative box */}
                <div className="absolute -inset-4 bg-gradient-to-tr from-brand-secondary/5 to-brand-primary/5 rounded-2xl -z-10" />
                <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-brand-accent/5 rounded-full blur-2xl -z-10" />
                
                {/* Frame */}
                <div className="bg-brand-card p-3 rounded-2xl border border-brand-border/40 shadow-xl shadow-brand-text/5 overflow-hidden">
                  <div className="aspect-[4/5] w-full rounded-xl overflow-hidden bg-brand-bg-sec relative group">
                    <img
                      src="/brand/mentores/el-gonzo/1.png"
                      alt="El Gonzo - Fundador de PSICOEMOTRADING"
                      className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-brand-text/40 via-transparent to-transparent opacity-60" />
                    <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-3 rounded-lg border border-brand-border/30">
                      <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">El Gonzo</p>
                      <p className="text-xs text-brand-text-muted font-medium">Fundador &amp; Especialista en Psicología de Trading</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problema Section */}
      <section className="py-20 bg-brand-bg-sec border-y border-brand-border/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-xs font-bold tracking-widest text-brand-accent uppercase mb-2 block">
              El diagnóstico real
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-brand-text tracking-tight">
              El problema no siempre está en tu estrategia.
            </h2>
            <p className="mt-4 text-brand-text-muted leading-relaxed">
              Muchos traders acumulan cursos técnicos y buscan el indicador perfecto, pero continúan saboteando sus cuentas. El obstáculo real está en el procesamiento de la pérdida y la falta de control emocional.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Problema 1 */}
            <div className="p-8 bg-brand-card rounded-xl border border-brand-border/30 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              <div className="h-10 w-10 bg-brand-error/10 text-brand-error rounded-lg flex items-center justify-center mb-6">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-brand-text mb-3">Ansiedad y FOMO</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Entrar apresuradamente al mercado por miedo a quedarse afuera del movimiento. Forzar operaciones que no cumplen con tu plan de trading.
              </p>
            </div>

            {/* Problema 2 */}
            <div className="p-8 bg-brand-card rounded-xl border border-brand-border/30 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              <div className="h-10 w-10 bg-brand-error/10 text-brand-error rounded-lg flex items-center justify-center mb-6">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-brand-text mb-3">Operativa de Revancha</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Intentar &quot;vengarse&quot; del mercado inmediatamente después de una pérdida. Aumentar el tamaño del lote de forma desmedida para recuperar el capital.
              </p>
            </div>

            {/* Problema 3 */}
            <div className="p-8 bg-brand-card rounded-xl border border-brand-border/30 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              <div className="h-10 w-10 bg-brand-error/10 text-brand-error rounded-lg flex items-center justify-center mb-6">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-brand-text mb-3">Indisciplina Selectiva</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Tener un plan bien estructurado en papel, pero omitir las reglas de parada de pérdida (stop loss) o toma de ganancias por ego o sesgo optimista.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Método Section */}
      <section id="metodo" className="py-20 bg-brand-bg scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-xs font-bold tracking-widest text-brand-secondary uppercase mb-2 block">
              Estructura de Trabajo
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-brand-text tracking-tight">
              El Método PSICOEMOTRADING
            </h2>
            <p className="mt-4 text-brand-text-muted leading-relaxed">
              Un enfoque sistemático diseñado específicamente para reconfigurar el comportamiento y las reacciones neuronales del trader frente a la incertidumbre financiera.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {/* Pilar 1 */}
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-16 h-16 rounded-full bg-brand-secondary/5 text-brand-secondary flex items-center justify-center font-black text-2xl mb-6 border border-brand-secondary/20 shadow-inner">
                01
              </div>
              <h3 className="text-xl font-bold text-brand-text mb-3">Conciencia Emocional</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Identificar y mapear las respuestas fisiológicas y los sesgos del cerebro (como la aversión a la pérdida) antes de apretar el botón, calmando la reactividad del sistema límbico.
              </p>
            </div>

            {/* Pilar 2 */}
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-16 h-16 rounded-full bg-brand-secondary/5 text-brand-secondary flex items-center justify-center font-black text-2xl mb-6 border border-brand-secondary/20 shadow-inner">
                02
              </div>
              <h3 className="text-xl font-bold text-brand-text mb-3">Bitácora de Conducta</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Llevar un registro riguroso de métricas psicológicas en correlación con tus trades. Medimos tu nivel de fatiga, tu estado de ánimo y tu nivel de desvío del plan operativo.
              </p>
            </div>

            {/* Pilar 3 */}
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-16 h-16 rounded-full bg-brand-secondary/5 text-brand-secondary flex items-center justify-center font-black text-2xl mb-6 border border-brand-secondary/20 shadow-inner">
                03
              </div>
              <h3 className="text-xl font-bold text-brand-text mb-3">Ejecución Regulada</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Aprender técnicas estructuradas de respiración y desconexión para tolerar las rachas perdedoras (drawdowns) sin alterar las reglas matemáticas de riesgo y capital.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Mentor Section */}
      <section className="py-20 bg-brand-bg-sec/50 border-t border-brand-border/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 lg:order-2">
              <span className="text-xs font-bold tracking-widest text-brand-accent uppercase mb-2 block">
                Acompañamiento Profesional
              </span>
              <h2 className="text-3xl font-extrabold text-brand-text tracking-tight mb-6">
                El Gonzo — Mentor y Especialista en Psicología de Trading
              </h2>
              <p className="text-brand-text-muted leading-relaxed mb-6 font-light text-lg">
                No creemos en gurúes que muestran riqueza instantánea ni autos deportivos de lujo. Creemos en el trabajo mental serio, riguroso y diario.
              </p>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    <svg className="w-5 h-5 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="ml-3 text-sm text-brand-text-muted">
                    <strong className="text-brand-text">Enfoque empírico:</strong> Análisis del comportamiento y bitácora del trader como herramienta de reestructuración cognitiva.
                  </p>
                </div>
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    <svg className="w-5 h-5 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="ml-3 text-sm text-brand-text-muted">
                    <strong className="text-brand-text">Acompañamiento humano:</strong> Mentoría personalizada y sincera, enfocada en la realidad de tus hábitos cotidianos y tus límites emocionales.
                  </p>
                </div>
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    <svg className="w-5 h-5 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="ml-3 text-sm text-brand-text-muted">
                    <strong className="text-brand-text">Disciplina operativa:</strong> Construcción de rutinas pre-mercado y post-mercado para erradicar la impulsividad.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Image */}
            <div className="lg:col-span-5 lg:order-1 flex justify-center">
              <div className="relative w-full max-w-sm">
                <div className="absolute -inset-4 bg-brand-primary/5 rounded-2xl -z-10" />
                <div className="bg-brand-card p-3 rounded-2xl border border-brand-border/40 shadow-xl overflow-hidden">
                  <div className="aspect-[4/5] w-full rounded-xl overflow-hidden bg-brand-bg-sec relative">
                    <img
                      src="/brand/mentores/el-gonzo/2.png"
                      alt="El Gonzo, Mentor de PSICOEMOTRADING"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comunidad Section */}
      <section className="py-20 bg-brand-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-brand-card rounded-2xl border border-brand-border/30 p-8 md:p-12 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-brand-secondary/5 rounded-full blur-2xl" />
            <div className="max-w-3xl relative z-10">
              <span className="text-xs font-bold tracking-widest text-brand-secondary uppercase mb-2 block">
                Comunidad Activa
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-brand-text tracking-tight mb-4">
                Un entorno para traders que decidieron dejar de improvisar.
              </h2>
              <p className="text-brand-text-muted leading-relaxed mb-6">
                El trading profesional puede ser solitario. En PSICOEMOTRADING fomentamos un espacio de acompañamiento sincero, donde compartimos bitácoras semanales, analizamos los detonantes psicológicos del mercado y nos mantenemos firmes en el cumplimiento de los límites de riesgo.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/register"
                  className="px-6 py-3 bg-brand-secondary hover:bg-brand-secondary/95 text-white font-semibold rounded-lg text-center shadow-sm transition-all duration-200"
                >
                  Unirme a la comunidad
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Courses Section */}
      <section className="py-20 bg-brand-bg-sec border-t border-brand-border/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12">
            <div>
              <span className="text-xs font-bold tracking-widest text-brand-primary uppercase mb-2 block">
                Programas de Formación
              </span>
              <h2 className="text-3xl font-extrabold text-brand-text tracking-tight">
                Nuestros Entrenamientos
              </h2>
              <p className="text-brand-text-muted mt-1">
                Elegí la modalidad que mejor se adapte a tu nivel y necesidades operativas.
              </p>
            </div>
            <Link
              href="/campus"
              className="mt-4 md:mt-0 text-brand-primary hover:text-brand-primary/80 font-bold flex items-center space-x-1 transition-colors"
            >
              <span>Ver todos los cursos</span>
              <span>→</span>
            </Link>
          </div>

          {courses.length === 0 ? (
            <div className="bg-brand-card rounded-xl border border-brand-border/30 p-12 text-center shadow-sm">
              <p className="text-brand-text-muted">Pronto tendremos entrenamientos disponibles. ¡Mantente al tanto!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {courses.map((course) => (
                <div
                  key={course.id}
                  className="bg-brand-card rounded-xl border border-brand-border/30 shadow-sm overflow-hidden flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
                >
                  {course.thumbnail && (
                    <div className="h-48 w-full overflow-hidden bg-brand-bg-sec relative">
                      <img
                        src={course.thumbnail}
                        alt={course.title}
                        className="w-full h-full object-cover"
                      />
                      <span className={`absolute top-4 right-4 px-3 py-1 text-xs font-bold rounded-md shadow-sm ${
                        course.type === 'LIVE' 
                          ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/25' 
                          : 'bg-brand-secondary/15 text-brand-secondary border border-brand-secondary/25'
                      }`}>
                        {course.type === 'LIVE' ? 'Mentoria En Vivo' : 'Grabado'}
                      </span>
                    </div>
                  )}
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="text-lg font-bold text-brand-text mb-2 line-clamp-1">
                      {course.title}
                    </h3>
                    <p className="text-brand-text-muted text-sm line-clamp-3 mb-6">
                      {course.shortDescription}
                    </p>
                    <div className="mt-auto pt-4 border-t border-brand-border/20 flex items-center justify-between">
                      <div className="flex flex-col">
                        {(() => {
                          const pricing = formatCoursePrice(course, getDefaultCurrency(course));
                          return (
                            <>
                              {pricing.hasOriginalPrice && (
                                <span className="text-xs text-brand-text-muted/65 line-through font-light">
                                  {pricing.originalPriceLabel}
                                </span>
                              )}
                              <span className="text-lg font-extrabold text-brand-primary">
                                {pricing.currentPriceLabel}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      <Link
                        href={`/campus/${course.slug}`}
                        className="text-sm font-semibold text-brand-secondary hover:text-brand-primary transition-colors"
                      >
                        Ver detalles →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 bg-brand-bg text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-extrabold text-brand-text tracking-tight mb-4">
            ¿Listo para profesionalizar tu trading?
          </h2>
          <p className="text-brand-text-muted text-lg max-w-xl mx-auto mb-8 font-light">
            Dejá de operar desde la rabia o la codicia. Empezá hoy mismo tu proceso de formación mental aplicada a los mercados financieros.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link
              href="/register"
              className="w-full sm:w-auto px-8 py-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg shadow-sm hover:-translate-y-0.5 transition-all"
            >
              Registrarme gratis ahora
            </Link>
            <Link
              href="/campus"
              className="w-full sm:w-auto px-8 py-4 bg-transparent hover:bg-brand-bg-sec text-brand-text border border-brand-border font-semibold rounded-lg hover:-translate-y-0.5 transition-all"
            >
              Ver cursos disponibles
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
