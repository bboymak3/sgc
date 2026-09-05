// Middleware para la página de aprobación
export function onRequest(context) {
  // Permitir acceso sin autenticación
  return context.next();
}
