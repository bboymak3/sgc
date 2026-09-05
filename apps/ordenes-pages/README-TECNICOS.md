# Sistema de Gestión de Técnicos - SGC

## 📋 Resumen de Implementaciones

Este documento describe todas las mejoras y nuevas funcionalidades implementadas en el sistema de SGC.

---

## 🔧 Correcciones de Bugs

### 1. ✅ Bug de Espacios en Patente
**Problema:** Las patentes con espacios causaban errores en las búsquedas.

**Solución:**
- Se agregó `.replace(/\s+/g, '')` en tres puntos:
  - Al guardar la orden (`app.js` línea 143)
  - Al buscar vehículo por patente (línea 85)
  - Al buscar órdenes (línea 271)

**Archivos modificados:**
- `app.js`

---

### 2. ✅ Mejoras en Generación de PDF
**Problema:** El PDF tenía texto demasiado grande, datos cortados y diseño ineficiente.

**Solución:**
- Cambiado a orientación landscape (horizontal)
- Reducido tamaño de fuentes:
  - Títulos: de 20px a 16px
  - Subtítulos: de 14px a 12px
  - Texto normal: de 10px a 7-9px
  - Footer: de 8px a 6px
- Mejor uso del espacio con espaciado más compacto (4-6px en lugar de 6-8px)
- Diseño más eficiente que evita que se corte contenido

**Archivos modificados:**
- `app.js` (función `generarPDF`)

---

## 📱 Aplicación Móvil para Técnicos

### Estructura de Archivos

```
/tecnico/
├── app.html          # Interfaz principal de la app móvil
└── app.js            # Lógica de la app móvil

/functions/api/tecnico/
├── login.js          # Autenticación de técnicos
├── ordenes.js        # Listar órdenes asignadas
├── orden.js          # Ver detalle de orden
├── cambiar-estado.js # Cambiar estado del trabajo
├── subir-foto.js     # Subir fotos (antes/después/evidencia)
├── fotos.js          # Obtener fotos de una orden
├── agregar-nota.js   # Agregar notas a la orden
├── notas.js          # Obtener notas de una orden
└── historial.js      # Ver historial de seguimiento
```

### Funcionalidades Implementadas

#### 1. 🟢 Autenticación de Técnicos
- Login con teléfono y PIN de 4 dígitos
- Sesión persistente (localStorage)
- Validación de credenciales en servidor

**API:** `POST /api/tecnico/login`

#### 2. 📋 Dashboard de Órdenes
- Tres pestañas: Pendientes, En Curso, Completadas
- Auto-actualización cada 30 segundos
- Visualización de información clave:
  - Número de orden
  - Estado con color
  - Patente del vehículo
  - Nombre del cliente
  - Dirección

**API:** `GET /api/tecnico/ordenes?tecnico_id={id}`

#### 3. 🚗 Navegación GPS
- Botón para abrir Google Maps con la dirección del cliente
- Integración directa con navegación del celular

**Función:** `navegarGPS()`

#### 4. 📍 Captura de GPS y Tiempo
- Registro automático de ubicación al:
  - Llegar al sitio
  - Iniciar trabajo
  - Reportar no completado
- Fecha y hora automáticas

**API:** `POST /api/tecnico/cambiar-estado`

#### 5. 📸 Captura de Fotos
- Tres tipos de fotos:
  - **Antes:** Estado inicial del vehículo
  - **Después:** Trabajo completado
  - **Evidencia:** Documentación adicional
- Uso de cámara del dispositivo
- Almacenamiento en base de datos (preparado para Cloudflare R2)

**APIs:**
- `POST /api/tecnico/subir-foto`
- `GET /api/tecnico/fotos?orden_id={id}`

#### 6. 📝 Notas de Trabajo
- Agregar notas durante el trabajo
- Registro con fecha y hora
- Historial completo

**APIs:**
- `POST /api/tecnico/agregar-nota`
- `GET /api/tecnico/notas?orden_id={id}`

#### 7. ✅ Completar Orden
- Marcar trabajo como completado
- Opción de solicitar firma del cliente

#### 8. ❌ Reportar No Completado
- Selección de motivo predefinido:
  - Faltan piezas
  - Vehículo no disponible
  - Problema técnico
  - Cliente no disponible
  - Otro
- Campo para detalles adicionales
- Captura de GPS opcional

#### 10. 📊 Historial de Seguimiento
- Timeline de todos los cambios de estado
- Incluye GPS, hora y observaciones
- Registro completo de quién hizo cada cambio

**API:** `GET /api/tecnico/historial?orden_id={id}`

---

## 🖥️ Panel de Administración para Técnicos

### Estructura de Archivos

```
/functions/api/admin/
├── tecnicos.js        # Gestionar técnicos (GET/POST)
└── asignar-orden.js   # Asignar órdenes a técnicos
```

### Funcionalidades

#### 1. 👤 Registrar Nuevos Técnicos
- Formulario con:
  - Nombre (obligatorio)
  - Teléfono (obligatorio, único)
  - Email (opcional)
  - PIN de 4 dígitos (obligatorio, para acceso móvil)

**APIs:**
- `GET /api/admin/tecnicos` - Listar técnicos
- `POST /api/admin/tecnicos` - Crear técnico

#### 2. 📋 Asignar Órdenes a Técnicos
- Buscar orden por número
- Seleccionar técnico de lista
- Asignación con registro automático
- Estado de orden cambia a "Pendiente Visita"

**API:** `POST /api/admin/asignar-orden`

---

## 🗄️ Base de Datos - Esquema Actualizado

### Nuevas Tablas

#### `Tecnicos`
```sql
- id (INTEGER, PRIMARY KEY)
- nombre (TEXT, NOT NULL)
- telefono (TEXT, UNIQUE, NOT NULL)
- email (TEXT)
- codigo_acceso (TEXT, UNIQUE, NOT NULL)  -- PIN de 4 dígitos
- activo (INTEGER, DEFAULT 1)
- fecha_registro (DATETIME, DEFAULT CURRENT_TIMESTAMP)
```

#### `AsignacionesTecnico`
```sql
- id (INTEGER, PRIMARY KEY)
- orden_id (INTEGER, NOT NULL, FOREIGN KEY)
- tecnico_id (INTEGER, NOT NULL, FOREIGN KEY)
- fecha_asignacion (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- asignado_por (TEXT)  -- Nombre del admin
- UNIQUE(orden_id)  -- Una orden solo a un técnico
```

#### `SeguimientoTrabajo`
```sql
- id (INTEGER, PRIMARY KEY)
- orden_id (INTEGER, NOT NULL, FOREIGN KEY)
- tecnico_id (INTEGER, NOT NULL, FOREIGN KEY)
- estado_anterior (TEXT)
- estado_nuevo (TEXT, NOT NULL)
- latitud (REAL)
- longitud (REAL)
- fecha_hora (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- observaciones (TEXT)
```

#### `FotosTrabajo`
```sql
- id (INTEGER, PRIMARY KEY)
- orden_id (INTEGER, NOT NULL, FOREIGN KEY)
- tecnico_id (INTEGER, NOT NULL, FOREIGN KEY)
- tipo_foto (TEXT, NOT NULL)  -- 'antes', 'despues', 'evidencia'
- url_imagen (TEXT, NOT NULL)
- descripcion (TEXT)
- fecha_subida (DATETIME, DEFAULT CURRENT_TIMESTAMP)
```

#### `NotasTrabajo`
```sql
- id (INTEGER, PRIMARY KEY)
- orden_id (INTEGER, NOT NULL, FOREIGN KEY)
- tecnico_id (INTEGER, NOT NULL, FOREIGN KEY)
- nota (TEXT, NOT NULL)
- fecha_nota (DATETIME, DEFAULT CURRENT_TIMESTAMP)
```

### Modificaciones a Tablas Existentes

#### `OrdenesTrabajo`
Nuevos campos agregados:
```sql
- direccion (TEXT)  -- Dirección del cliente
- referencia_direccion (TEXT)  -- Referencia adicional
- tecnico_asignado_id (INTEGER, FOREIGN KEY -> Tecnicos.id)
- estado_trabajo (TEXT, DEFAULT 'Pendiente Visita')
```

### Estados de Trabajo

El flujo de estados de una orden es:

1. **Pendiente Visita** - Orden creada y asignada a técnico
2. **En Sitio** - Técnico llegó al lugar (con GPS)
3. **En Progreso** - Técnico comenzó a trabajar (con GPS y hora)
4. **Pendiente Piezas** - Esperando repuestos
5. **Completada** - Trabajo terminado, pendiente firma
6. **Aprobada** - Trabajo terminado y firmado por cliente
7. **No Completada** - No se pudo completar (con justificación)

---

## 🚀 Cómo Usar el Sistema

### Para Administradores

#### 1. Registrar un Técnico
1. Ir al panel admin
2. Seleccionar "Gestión Técnicos"
3. Completar el formulario:
   - Nombre: "Juan Pérez"
   - Teléfono: "+56912345678"
   - Email: "juan@email.com" (opcional)
   - PIN: "1234"
4. Click en "Registrar Técnico"

#### 2. Asignar una Orden a un Técnico
1. En "Gestión Técnicos"
2. En sección "Asignar Orden a Técnico"
3. Ingresar número de orden (ej: 58)
4. Seleccionar técnico de la lista
5. Click en "Asignar Orden"
6. La orden aparecerá en la app del técnico

### Para Técnicos

#### 1. Iniciar Sesión
1. Abrir la app móvil en `/tecnico/app.html`
2. Ingresar teléfono: "+56912345678"
3. Ingresar PIN: "1234"
4. Click en "Ingresar"

#### 2. Trabajar en una Orden
1. Ver lista de órdenes pendientes
2. Click en una orden para ver detalles
3. Click en "Navegar al Lugar" (abre Google Maps)
4. Al llegar, click en "Llegué al Sitio" (captura GPS)
5. Click en "Iniciar Trabajo" (captura GPS y hora)
6. Tomar fotos antes, durante y después
7. Agregar notas según sea necesario
8. Al terminar, click en "Completar Trabajo"
9. Opcionalmente, pedir al cliente que firme en el celular

#### 3. Si No Se Puede Completar
1. Click en "No Completado"
2. Seleccionar motivo
3. Agregar detalles
4. Click en "Reportar"

---

## 📦 Próximos Pasos Recomendados

### 1. Ejecutar Script de Base de Datos
Ejecutar `schema-tecnicos.sql` para crear las nuevas tablas:
```bash
# En tu entorno de Cloudflare D1
npx wrangler d1 execute <tu-base> --file=schema-tecnicos.sql
```

### 2. Configurar Cloudflare R2 (Opcional pero Recomendado)
Para almacenar fotos de forma profesional:
1. Crear bucket en Cloudflare R2
2. Configurar subida de imágenes a R2 en lugar de base64
3. Modificar `subir-foto.js` para usar R2

### 3. Desplegar la App Móvil
La app móvil puede ser desplegada en:
- Subdominio: `tech.sgc-ordenes.pages.dev`
- O en el mismo dominio con ruta `/tecnico/`

### 4. Probar el Flujo Completo
1. Crear una orden
2. Registrar un técnico
3. Asignar la orden al técnico
4. Técnico inicia sesión y trabaja la orden
5. Verificar GPS, fotos, notas y firma

---

## 🎨 Diseño y UX

### App Móvil
- **Colors:** Gradiente púrpura/azul de fondo
- **Tarjetas:** Blancas con sombras suaves
- **Botones:** Colores según acción (verde=positivo, rojo=negativo)
- **Tipografía:** San Francisco/Segoe UI (nativa del dispositivo)
- **Responsive:** Diseño mobile-first optimizado para celulares

### Panel Admin
- **Colors:** Rojo corporativo (#a80000)
- **Consistencia:** Mismo estilo que el panel existente
- **Integración:** Se agrega como nueva sección del navbar

---

## 📝 Notas Técnicas

### Seguridad
- Validación de todas las entradas
- Verificación de que el técnico solo puede ver sus propias órdenes
- Los PINs se almacenan en texto plano (para MVP, pero debería usar hash en producción)

### Performance
- Carga de datos optimizada con queries específicas
- Auto-actualización cada 30 segundos (configurable)
- Fotos en base64 (limitado, idealmente usar R2)

### Compatibilidad
- Soporte para touch events en canvas de firma
- Geolocalización con fallback si no está disponible
- Compatibilidad con iOS y Android

---

## ✅ Checklist de Implementación

- [x] Corregir bug de espacios en patente
- [x] Mejorar generación de PDF (landscape, fuentes más pequeñas)
- [x] Crear esquema de base de datos para técnicos
- [x] Implementar autenticación de técnicos
- [x] Crear dashboard de órdenes para técnicos
- [x] Implementar navegación GPS
- [x] Capturar GPS y tiempo al iniciar trabajo
- [x] Sistema de fotos (antes/después/evidencia)
- [x] Sistema de notas de trabajo
- [x] Completar orden con firma del cliente en el celular del técnico
- [x] Reportar orden no completada con justificación
- [x] Panel admin para registrar técnicos
- [x] Panel admin para asignar órdenes
- [x] Historial completo de seguimiento

---

## 🎯 Resumen del Sistema de Firma

**Como solicitaste:**
- ❌ El admin NO firma (solo aprueba/revisa)
- ❌ El técnico NO firma
- ✅ El cliente puede firmar en el celular del técnico al completar el trabajo

**Hay DOS formas de obtener la firma del cliente:**

1. **Vía WhatsApp (existente):**
   - Admin envía link al cliente
   - Cliente firma en su propio celular
   - Orden queda aprobada

2. **Vía Técnico (nueva):**
   - Técnico completa el trabajo
   - Técnico muestra canvas de firma en su celular
   - Cliente firma con el dedo
   - Orden queda aprobada inmediatamente

Ambas formas son válidas y complementarias.

---

## 📞 Soporte

Si tienes preguntas o necesitas ayuda con la implementación, revisa:
1. Este documento README
2. Los comentarios en el código
3. Los archivos de esquema SQL

**¡El sistema está listo para usar!** 🚀
