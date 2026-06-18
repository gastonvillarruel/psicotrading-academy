export function isSingleSessionEnabled(): boolean {
  const enabled = process.env.ENABLE_SINGLE_SESSION !== 'false';
  // Agregar log simple para verificar en desarrollo
  console.log(`[SingleSession] ${enabled ? 'Enabled' : 'Disabled'}`);
  return enabled;
}
